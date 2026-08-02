## What is Mumble?

[Mumble][1] is an open-source, low-latency VoIP application, originally built for gaming. It is a self-hosted client–server system: the **Mumble client** connects to **Murmur**, the reference server, which relays audio between everyone in the same channel.

### Two connections, one conversation

Mumble splits its traffic across two connections with very different personalities:

- **A TLS-encrypted TCP control connection** carries all signaling as protobuf messages — authentication, channel state, user state, ACLs, text messages. The channel tree, permissions and usernames live here, on a reliable, stateful stream.
- **A UDP voice connection** carries the audio as small Opus-encoded datagrams, encrypted per session, optionally with positional data for 3D audio.

The client authenticates over TCP first; only then does the UDP flow start carrying audio.

### The state the server keeps

The server's world is small enough to hold in memory: a channel tree with its links, a session table mapping ids to users (name, channel, mute and priority-speaker flags), and the ACLs and bans that govern permissions. A lively server has a few hundred channels and a few thousand users — nothing that couldn't be replicated in full. But it is authoritative: every client expects the same answers, from whichever node it talks to.

### Delivering a voice packet

When a voice packet arrives, the server decides who should hear it — normal talk goes to everyone in the speaker's channel; whisper and shout use targets the client registered earlier over TCP — and sends each of them a copy, encrypted for that recipient. That is the whole job, and the fact that matters for clustering is the duplication: **one copy per listener**, which is exactly the O(speaker × listener) cost the seam below attacks.

### The seam

Now step back and look at the server's job through a distributed lens. It is really two jobs with opposite requirements:

- an **authority** that holds the world — channels, users, permissions — and must agree with every other node about what that world is;
- a **relay** that moves audio to whoever should hear it, with a deadline measured in milliseconds.

The relay job is where the arithmetic starts to hurt. A single relay point has to duplicate every voice packet once per listener: one speaker and thirty listeners means thirty copies leaving the server, so its outgoing traffic is O(speaker × listener) — and for cross-region traffic, every one of those copies pays the long-distance cost.

Clustering does not change *whether* the duplication happens, only *where*. Each node is still a perfectly ordinary Mumble server for its own clients; the only magic is that they all share one channel and member view. So the speaker's stream crosses the mesh once per node that has listeners, arrives near them, and only then is duplicated into one copy per local listener. The long-distance part of the fan-out shrinks from per-listener to per-region; the per-listener duplication happens on the cheap local leg, after the voice has already been delivered close to home.

The authority job, meanwhile, is small and slow and *replicable*: broadcast it to every node in a total order, and they all agree. That, plus the relay insight, is the whole design — the rest of this article is about making it real.

## Why a distributed server?

A stock Murmur has exactly one location, and distance is hostile to voice in more ways than one. For anyone far from that location, a community spread across the US, Europe and Asia faces a stack of problems:

1. **Availability.** Internet access is not equal. A server that is perfectly reachable for one player can be nearly unreachable for another — a bad ISP, a congested peering point, a route that barely exists. Some users may not be able to use the server reliably at all.
2. **Latency.** The server's location forces the worst-case round trip on everyone, no matter how close two speakers are to each other. A player in Berlin talking to a player in Tokyo produces audio that crosses the Atlantic, a continent and the Pacific twice per sentence.
3. **Packet loss and responsiveness.** The longer the path, the more lossy and jittery the links — and for voice that is not a small annoyance, it is the difference between a conversation that works and one that falls apart.
4. **Load.** Everything converges on the one node: each speaker's audio is duplicated to every listener at a single point, so the server carries the whole community's traffic, multiplied once per listener.
5. **Data residency.** Not every user wants their voice — and the metadata around it — to cross a border every time they talk. Compliance, privacy, or plain preference can make a single fixed location unacceptable, no matter how well it performs.

The obvious fix — and the one most deployments reach for first — is a dumb TCP proxy: put a relay at each region, point the local clients at it, and have it forward to the single real server, ideally over a dedicated link between the two. Be precise about what that buys. It does *not* fix latency — the audio still crosses the same long-distance path, now with an extra relay hop and TCP's overhead on top. What a dedicated link plus TCP's retransmission does fix is packet loss and reliability: a lossy public path becomes a dependable pipe. And even then the fix fails in three instructive ways. First, the proxy is a plain TCP box that knows nothing about Mumble, so the UDP voice path quietly dies: clients fall back to tunneling their audio over the TCP connection, losing the low-latency, low-overhead datagram path entirely. Second — worse — the proxy is a *dumb* relay. When several players in the same channel all connect through the same proxy, the server still sends each of them their own voice stream (it re-encrypts per recipient, remember), and the proxy dutifully shuffles every one of those streams between itself and the server. The duplication the proxy was supposed to hide reappears, multiplied by the number of listeners and concentrated on one link — and because each stream is individually encrypted, the proxy cannot even tell they carry the same audio, short of becoming a full man-in-the-middle server itself. Third — the one that hurts eventually — nothing about this scales. The dedicated link and the server's uplink are fixed-bandwidth pipes, and the per-listener duplication above means you slam into those caps with a surprisingly small crowd. Worse, there is no horizontal escape: every region's traffic still funnels through the same two points, so adding a proxy does nothing for the server, and "more bandwidth" means buying a bigger pipe rather than adding a node. The real fix is not a smarter proxy or a bigger pipe; it is to stop sending long-distance audio through a choke point at all.

Two observations motivate a distributed design:

1. **Audio should travel as little as possible.** Put a node near each cluster of users — one per continent, one per datacenter region — and client-to-node traffic is a short local last mile. Only conversations that are genuinely cross-region pay the long-haul cost, and only for the participants who are actually far apart.

2. **The Internet is not the best path between your own nodes.** The public route between your datacenters is whatever BGP decided, with whatever jitter and loss that implies. You often have something better: a private backbone, a VPN mesh, a WireGuard or Tailscale network. The server should *measure* every path it has and prefer the good one — not because an operator hard-coded a preference, but because the routing math says it is cheaper.

The whole design leans on a theory about how communities actually form: players cluster into regions — mostly along language lines — so the majority of conversations are local and never need cross-border transit in the first place. But clustering must never become siloing: the community still needs to collaborate, and it is bad if people in different regions stop seeing each other. The cluster threads that needle. A conversation that genuinely *is* cross-region now costs exactly one stream across the border — the speaker's — fanned out locally on the far side, instead of one stream per remote listener as the dumb proxy forced. Cross-border traffic scales with **speakers, not listeners**; and the local speaker–listener pairs that dominate real usage keep minimum latency, because their audio never leaves the region at all.

Clustering also buys something the single-server model never had: redundancy. There is no centralized story — no master node, no single point of failure. Every server carries a full copy of the shared world — channels, members, permissions — and it needs exactly that copy, and nothing else, to do its duty: routing voice for its own clients. And each node individually owns its clients: a session belongs to the node it connected to, so there is no global session authority in the middle either. If a node dies, the loss is contained — only its local users drop, and the rest of the mesh keeps the same shared view and carries on.

So the design goal is: a mesh of nodes, each speaking Mumble to its local clients and speaking a server-to-server protocol to the others; state replicated so every node sees the same channels and members; voice forwarded along the cheapest *measured* path. As a bonus, it is a genuinely fun problem — Mumble's split means inter-node state is a small, well-defined replication problem, and voice is a routing problem.

## Architecture

Every node is two things at once: a normal Mumble server for its local clients, and a router in the mesh. The server-to-server stack is layered:

```
Mumble clients (TCP control + UDP voice)
        │
        ▼
┌────────────────────────────────────────┐
│ Server runtime: sessions, voice        │
│ routing, channel and member state      │
└────────────────┬───────────────────────┘
                 │  state ops / voice frames
                 ▼
┌────────────────────────────────────────┐
│ Application: voice, text, moderation,  │
│ plugin data                            │
├────────────────────────────────────────┤
│ Replication: strict (channels, bans),  │
│ owner-mode (members), blob (channel    │
│ content)                               │
├────────────────────────────────────────┤
│ Overlay: neighbor probing, link-state  │
│ database, routing, ordered messages    │
├────────────────────────────────────────┤
│ Transport: TCP · KCP · QUIC · UDP      │
└────────────────────────────────────────┘
```

The transport layer is where the "mesh" stops being a metaphor. Peers can connect over plain TCP, over KCP (a reliable protocol on top of UDP), over QUIC, or over packet-encrypted raw UDP — and KCP, QUIC and UDP happily share one UDP socket, demultiplexed in userspace by a prefix byte in each frame. QUIC itself is split into *delivery lanes*: best-effort traffic rides in unreliable DATAGRAM frames, while control and regular traffic get dedicated reliable streams, each preserving its own ordering. A node can even join the mesh as a transit-only relay, forwarding traffic without accepting any Mumble clients.

Above the transports sits the overlay. Every node constantly probes its neighbors — RTT, loss, jitter — smooths the samples, floods them through the network as link-state advertisements, and recomputes a shortest-path tree with a dynamic SPF algorithm. That measured-cost routing table is the heart of the whole "better route" story; it reappears in the voice section.

## Channel replication

The channel tree and the ban list are replicated with a *total-order broadcast*: leaderless, multi-writer, in the style of [Tempo][5]. There is no master node and no sharding — every node may propose a channel change, and the protocol guarantees every node applies the same sequence of operations in the same order. Why multi-writer at all? Because channels have no single natural owner: an admin on any node may legitimately create, edit or delete any channel, so the only way to keep the result consistent is to make every writer's operation land in one agreed order.

Imagine an admin connected to node A renames a channel. The flow:

1. The client handler turns the rename into a channel operation and hands it to the server-to-server layer.
2. The operation becomes a proposal carrying an operation id and a proposed timestamp, and is sent to every peer.
3. Each peer ACKs the proposal with its *local* clock. The final timestamp is the **maximum** of all ACK timestamps (falling back to the proposed time if nobody replied). Because the proposer's own clock alone never decides the order, nobody gains an advantage by being first to propose.
4. Commits are buffered and delivered in `(final timestamp, operation id)` order — every node commits one identical total order, and the proposer enjoys no special privilege.

When the commit lands on node B, it is written to a durable write-ahead log, applied to the channel map, and the ACL/link caches are rebuilt — then B re-broadcasts the new channel state to its *own* local clients, so from their point of view the rename happened locally. Side effects like ACL re-evaluation run on each node independently, which is what makes the system eventually identical everywhere.

And the classic fear — two admins on two nodes editing at the same time? There is no optimistic merge magic. Both operations simply land in the same total order and are applied identically everywhere, exactly as if one admin had performed them in sequence. Stale nodes are caught, too: the repository rejects out-of-order versions, so an outdated node cannot silently overwrite newer state.

Because a voice server is allowed to care about durability, the strict path keeps a *terminal journal*: a durable record of the final commit/abort decision for every operation, chained by hash. On restart or after a crash, a node runs a history election, transfers authenticated terminal-state pages and deltas to the straggler, and replays idempotently. This is what turns "eventually consistent" into "converges, and can prove it".

## Member replication

Members use a completely different mechanism, and the difference is not incidental — it follows from who is allowed to change what. The channel list is expected to be mutated by *every* node, which is why it needs strict total-order replication. The client list is the opposite: it must be *readable by everyone* — every node needs to know who is in which channel to route voice — but *modifiable by only one node*. Each client belongs to exactly one node, its "home" node, the one it connected to; that node is the sole writer, and it has the final say on what the client is like, because the client's connection lives there and the owner sees its state directly — every mute toggle, channel move and flag change arrives at the owner first. Everyone else gets a read-only copy. The ownership is baked into the identity. Mumble sessions live in one shared u32 namespace, and the whole cluster has to use it without colliding: if two nodes both handed out session 5, nobody could tell the two users apart. The session identifier therefore packs the node id into the top bits and the node's own session counter into the bottom bits — every node owns a disjoint slice of the u32 space, so it can allocate session numbers locally, with no global allocator and no cross-node locking. Telling whose user this is at a glance falls out for free.

When a user joins node A:

1. A's client registry logs the mutation and broadcasts an owner operation — origin node, origin epoch, origin version, and the serialized "user joined" event — to the mesh.
2. Only *then* is it applied locally. Broadcast first, apply second: remote nodes can never observe a state its owner hasn't published.
3. Node B receives it, checks the epoch fence (a node that restarted starts a new epoch, so stale writers are rejected), orders it by per-origin version, and — importantly — **waits for channel catch-up first**. A user joining a channel that hasn't been replicated yet would be nonsense, so member events carry a dependency on the channel version.
4. B materializes a full remote user record and re-broadcasts the user state to B's local clients. From their perspective, the remote player simply appeared in the channel list.

Because each origin's log is version-ordered and epochs fence stale writers, the mesh gets per-node total order for members without paying for global consensus on every join and leave — only channels and bans need that. When a node restarts or drops out, its peers purge its users, which is the distributed version of "the server restarted, everyone got kicked".

One neat consequence: **cross-node moderation is unicast**. If an admin on node A mutes a user who is homed on node B, A doesn't try to apply the mute itself — it sends the intent to B, the user's owner, which applies it locally and lets owner replication propagate it. Every user has exactly one authority, which keeps the permission logic tractable.

## Voice routing

Voice is where the distributed part has to earn its keep: audio has a deadline measured in milliseconds, while the replication above can afford seconds. The design rule: *never send audio where it doesn't need to go, and always use the best measured path.*

**Same node.** If speaker and listener are both on node A, the mesh is never involved: the router fans the decoded Opus frame out to local listeners in a single pass, and the remote copy is skipped entirely when nobody on other nodes can hear it. Local voice behaves exactly as it would on a single Murmur.

**Across nodes.** When there are remote listeners, the source node wraps the Opus bytes in a small envelope — voice target, positional data, volume adjustment, a per-sender sequence number, and a "last frame of this burst" flag — and hands it to the mesh as best-effort, high-priority traffic. The overlay sends it down a source-rooted multicast tree; transit nodes forward the payload without decoding it — they are routers with a byte payload, nothing more. On the destination node, a per-speaker reorderer with an adaptive jitter buffer (roughly 40–120 ms) reassembles the stream, resolves the local recipients, and sends each of them a copy in a batched UDP send.

**Picking the route.** Here is the payoff of the measured-cost overlay. The cost used by the shortest-path tree is an E-model style *conversational impairment* computed from measured RTT, jitter, throughput and loss — with the delay penalty including RTT plus three standard deviations of jitter, because for speech it is the *tail* of the jitter distribution that hurts. Link metrics come from real probes between neighbors, not from configuration. Consequences:

- A private WireGuard or Tailscale path with lower RTT and loss *automatically wins* over a shorter-looking public path: Dijkstra just follows the lowest measured cost. The config makes the private mesh easy to advertise, but nothing hard-codes the preference.
- For voice, the preferred tier is datagrams — raw UDP and QUIC DATAGRAM: they are cheaper, and a lost packet costs only that one frame instead of stalling the whole stream. The reliable transports form the fallback tier. In theory TCP and KCP sit on the same level there, but in practice KCP has a bad track record of delivering voice over a lossy link, which makes it sort of unusable for this job; TCP is for the case where UDP is not available at all. A path that is performing well is kept — voice "sticks" to it rather than flapping on noise.
- If a link degrades mid-conversation, queue pressure reroutes to a first-hop alternate.

**Losing packets anyway.** Best-effort means losses happen, and there is a good reason to fight them rather than shrug: over a long route, latency is already a lost cause. It is bound by the physical propagation delay of the path, and no amount of routing cleverness eliminates it — so we don't chase it. What *can* be fixed at distance is quality: a long route crosses more links, and every extra link is another chance for a packet to drop, so loss is systematically worse when the delivery is long. When the latency budget is already spent, the right trade is to spend it on repair and make sure the frames still arrive — hence the repair stack. Note what it is *not*: a reliable link in disguise. A reliable transport keeps retransmitting until delivery and can stall the whole stream behind persistent loss; the repair stack fixes only *some* of the loss — whatever the budget and the deadline allow — and it never blocks on the rest. If a gap turns out to be irreparable, the stream plays on with a hole rather than waiting; a budget bounds how much repair traffic is spent, and everything stays best-effort throughout. Sequence numbers plus the terminator flag let receivers detect gaps; the receiver schedules a NACK that is answered from the speaker's repair cache — deliberately sent around the very link that dropped the original. There are also *proactive* duplicate copies, scored by how much they help (path diversity, on-time probability, urgency) and rationed by a global budget, and *tail repair* for the one frame with no successor to trigger a NACK. Everything has a short TTL, because a voice packet that arrives late is worse than one that never arrives.

## Closing thoughts

The cleanest insight in the whole design is that Mumble's protocol already separates state from audio — exactly the seam a distributed implementation needs. Replicate the small state precisely (channels with total-order broadcast, members with per-node ownership), and route the bulk audio pragmatically (measured-cost mesh, best-effort with repair). The result is the property you actually want from geo-distribution: a player's voice crosses a continent only when the person they are talking to is on another continent — and even then it takes the best route you have, which might just be your own wire.

## References

- [Mumble][1] — official project; the [voice protocol documentation][2] and the [protocol readthedocs][3] cover the TCP control + UDP voice split and voice delivery.
- [shitspeak-rs][4] — the Rust source this article is based on; its `docs/` directory is an unusually current description of the system.
- [Tempo][5] — the total-order broadcast protocol the channel replication is styled after.

[1]: https://www.mumble.info/
[2]: https://www.mumble.info/documentation/developer/voice-connections/
[3]: https://mumble-protocol.readthedocs.io/
[4]: https://github.com/wfjsw/shitspeak-rs
[5]: https://dl.acm.org/doi/10.1145/3304101.3308113
