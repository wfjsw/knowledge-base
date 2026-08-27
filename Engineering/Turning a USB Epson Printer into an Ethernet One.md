# Turning a USB-only Epson receipt printer into an Ethernet one

We had an Epson TM-T88IV on USB, and Windows software that refused to see it,
because it only knows how to print to **network-shared** TM printers. A network
dongle is wildly expensive, so we taught the USB printer to *sound* like an
Ethernet one.

Since I have no access to a real Ethernet TM printer, this is a **reverse-engineering project**.
The goal is to make a Raspberry Pi act as a facade for the USB printer,
so the client thinks it's talking to a real Ethernet printer.

## What a network TM printer speaks

Two protocols, one per stage:

1. **ENPC** — UDP/3289. The Port Assignment Tool probes it to find printers and
   learn their model/IP/MAC. The print driver keeps talking to it while a job
   runs.
2. **raw ESC/POS** — TCP/9100. The print channel: whatever the application
   writes is forwarded verbatim, and whatever the printer replies comes back on
   the same connection. No framing, no handshake.

## RE 1: the ENPC discovery protocol

### The header

Hit **Search** in the Port Assignment Tool and it throws this at
`255.255.255.255:3289`:

```
45 50 53 4F 4E 50 00 00 00 00 00 00 00 00
EPSON         P                        ← type letter
```

`EPSON` magic, a one-byte type letter, then zeros. First rule of ENPC: requests
are uppercase (`P`, `Q`, `C`), replies lowercase (`q`, `c`). The header is 14
bytes:

| Offset | Size | Field |
|---|---|---|
| 0 | 5 | magic `"EPSON"` |
| 5 | 1 | type letter |
| 6 | 1 | device type (`0x03` = printer) |
| 7 | 1 | device number (always 0) |
| 8 | 2 | function code, big-endian |
| 10 | 2 | result code, big-endian (`0` = ok) |
| 12 | 2 | payload length, big-endian |
| 14 | n | payload |

### Reading the parser

We confirmed the layout by reading the
client. `EpsCa.exe` contains a per-byte parser state machine (`sub_42F818`)
that walks every incoming UDP payload, and **that state machine is the
spec**: it cannot lie about the byte layout. It maps the type letter
(`p,i,q,s,c,n → 0..5`), validates device type, accumulates the function, result
and length words, then copies the payload.

### The 54-byte `UB-E` record

A probe (`EPSONP` broadcast, or `EPSONQ` directed to an IP) is answered with a
`q` reply carrying a **54-byte payload**:

```
[ 0..3]  "UB-E"          ← Ethernet-interface marker
[ 4]     0x00
[ 5..]   model name, NUL-terminated   (e.g. "TM-T88IV")
[36..39] IP address, network byte order
[40..45] MAC address
[46..53] unused
```

The client only turns a reply into a device entry (`sub_42E500`) when *all* of
these hold:

* kind `q`, device type `0`, function `0`
* result `0` **or** `0xE000`
* length exactly `54`
* `payload[0..3] == "UB-E"`

Two details that only surface from disassembly:

1. **Byte 36 doubles as an interface-type selector.** A payload IP starting
   with 1/2/3 sets different record flags; anything else (a real `192.x`)
   falls back to plain Ethernet. Our `192.168.50.111` gets the same fallback a
   real printer with a `192.x` address gets — correct by accident.
2. **The client displays the *source IP* of the UDP reply.** The payload IP/MAC
   become secondary fields. A bridge could fake them; we populate them
   truthfully anyway.

After the record is built, the client sends a **model-name query**
(`EPSONQ`, device type 3, function 0) and reads the model string from
`payload[5..]`. Reply with `UB-E\x00` + model + `\x00` and the entry is
complete.

Discovery, in full:

```
EPSONP 00 00 00 00 00 00 00 00      broadcast probe
EPSONQ 00 00 00 00 00 00 00 00      directed probe
EPSONQ 03 00 00 00 00 00 00 00      model-name query
→ q + echoed devtype/function + result 0 + len + payload
```

## RE 2: the print path

The finding that turned a toy into a working bridge: **`EpsonPortEmulator.dll`
— the driver that actually opens the print channel — is itself an ENPC
client.** Before it opens TCP/9100 it interrogates the printer over UDP/3289,
and it keeps interrogating while it streams a job.

The driver's complete request set, and the replies it demands:

| Request | Meaning | The reply the driver demands |
|---|---|---|
| `Q 03 00 00 20` | "may I open the print port?" | `q`, result 0, len 1, payload `00` |
| `Q 03 00 00 17` | "is the port free?" | `q`, result 0, len 4, all-zero (non-zero = busy) |
| `Q 03 00 00 14` | "how much free receive buffer?" | `q`, result 0, len 8 = 4 zero bytes + 4-byte BE free size |
| `Q 03 00 00 10` | "status?" | `q`, result 0, len ≥ 1, bit0 = not busy |
| `C 03 00 00 12` (payload `00`) | Reset | `c`, result 0, empty accepted |
| `C 03 00 00 15` (payload `00`/`01`) | set/toggle | `c`, result 0, len 1, **echo the payload byte** |
| `C 03 00 00 16` (len 0) | clear connection-timeout timer | `c`, result 0, empty accepted |

The open path (`sub_18000CD54`) is explicit: before `connect()` on TCP 9100
(`htons(0x238C)` = 9100) it requires `Q` 0x20 *and* `Q` 0x17 to succeed —
otherwise the TCP connection is never opened. The
write loop polls `Q` 0x14 and sends `min(remaining, free)` bytes per iteration.
`C` 0x16 is a keepalive that keeps the printer's connection-timeout timer from
expiring; `C` 0x15 is a toggle whose payload must be echoed back.

Lifecycle of a job, from the printer's point of view:

```
idle:        driver may poll C 0x15 / C 0x16 (keepalive) at any time
app writes:  driver sends Q 0x20 + Q 0x17, then connects TCP :9100
streaming:   loop { Q 0x14 (free buffer) → send(min(free, remaining)) }
job end:     shutdown(SD_SEND), drain replies up to 30 s, close
```

## The implementation

`enpc_bridge.py` is two classes and two threads. `EnpcResponder` (UDP/3289)
synthesizes replies by echoing the request's device type and function with
result `0` and the exact payload per function. The whole protocol fits in the
frame builder:

```python
def enpc(kind, devtype, function, payload=b"", result=0):
    return (b"EPSON" + kind
        + bytes((devtype, 0))              # device type, device number
        + struct.pack(">H", function)      # function code
        + struct.pack(">H", result)        # result code
        + struct.pack(">H", len(payload))  # payload length
        + payload)
```

`TcpRelay` (TCP/9100) is a plain bidirectional pipe between the client socket
and the printer device, opened per connection and closed on disconnect. One
subtlety comes from real hardware: on usblp an empty read is a normal empty URB
completion — *keep waiting* — whereas an empty `recv()` on the socket means the
client closed the connection. The pump distinguishes the two sides.

## Validation

We ported the client's own acceptance logic into Python and made it the test oracle:

* `tests/enpc_probe.py` reimplements `sub_42F818` (parser) and `sub_42E500`
  (record gates) and feeds every bridge reply through them.
* `tests/enpc_dll_gates_test.py` checks the replies against
  `EpsonPortEmulator.dll`'s exact expectations.
* A real UDP round-trip on `127.0.0.1:3289` asserts replies come **from** port
  3289.

Then we went live on the Raspberry Pi: directed probe → 54-byte `UB-E` record,
model query, every print-path gate, and a 95-byte ESC/POS job (init, centered
text, feed, partial cut) relayed to `/dev/usb/lp0`. `DLE EOT` status reads work
over usblp too.

