> [!TLDR]
> Windows kept losing its public IPv6 SLAAC address because unsolicited ICMPv6 Router Advertisements were visible on the wire but were not being applied by the Windows IPv6 stack. The active Windows Firewall policy was missing the inbound Router Advertisement allow rule. Adding an inbound ICMPv6 type 134 allow rule from link-local routers fixed it:
>
> ```powershell
> New-NetFirewallRule `
>   -DisplayName "Allow ICMPv6 Router Advertisement for IPv6 SLAAC" `
>   -Direction Inbound `
>   -Action Allow `
>   -Protocol ICMPv6 `
>   -IcmpType 134 `
>   -RemoteAddress "fe80::/10" `
>   -Profile Any
> ```

I had a strange IPv6 problem on Windows where the machine would get a public IPv6 address after plugging in Ethernet, but the address disappeared a few minutes later. Unplugging and replugging the cable made it come back again. Other devices on the same LAN handled IPv6 just fine, so I wanted proof before blaming the router.

The adapter was a Realtek PCIe GbE controller. The IPv4 side stayed fine. What vanished was the public SLAAC address from the router-advertised prefix:

```powershell
Get-NetIPAddress -InterfaceAlias "Ethernet" -AddressFamily IPv6
```

The public address was in a prefix like `2001:db8:1234:5678::/64` (example prefix, not my real network). When it was broken, Windows still had link-local IPv6 and could still reach the router link-local address, but the global address was gone. Running this brought it back:

```powershell
ipconfig /renew6 Ethernet
```

The command printed a semaphore timeout, but the address and default IPv6 route returned anyway. That was already a useful clue: this was not a physical link failure.

## Packet capture

The Ethernet interface in `tshark` was interface 10:

```powershell
& "C:\Program Files\Wireshark\tshark.exe" -D
```

Capture ICMPv6 Router Solicitations and Router Advertisements:

```powershell
& "C:\Program Files\Wireshark\tshark.exe" `
  -p `
  -i 10 `
  -a duration:60 `
  -f "icmp6" `
  -Y "icmpv6.type == 133 || icmpv6.type == 134" `
  -T fields `
  -E header=y `
  -E separator=, `
  -e frame.time `
  -e eth.src `
  -e eth.dst `
  -e ipv6.src `
  -e ipv6.dst `
  -e icmpv6.type `
  -e icmpv6.nd.ra.router_lifetime `
  -e icmpv6.opt.prefix `
  -e icmpv6.opt.prefix.valid_lifetime `
  -e icmpv6.opt.prefix.preferred_lifetime
```

The router was sending valid RAs:

```text
src MAC: 60:cf:84:45:83:e0
src IPv6: fe80::62cf:84ff:fe45:83e0
dst IPv6: ff02::1
RA router_lifetime: 1800
prefix: 2001:db8:1234:5678::/64
prefix valid_lifetime: 600
prefix preferred_lifetime: 600
```

The 600 second lifetime matched the Windows countdown. At first this made the router look suspicious: a short lifetime means the host must keep receiving refresh RAs. But a longer capture showed the router was sending periodic multicast RAs every roughly 45 to 60 seconds. The NIC was seeing them, even with promiscuous mode disabled via `-p`.

The weird part was that Windows did not apply them. In one trace, RAs for the public prefix arrived at `01:12:58`, `01:13:54`, `01:14:42`, and `01:15:29`, but Windows still counted the public address down to zero and removed it.

When I triggered a Router Solicitation with `ipconfig /renew6 Ethernet`, Windows did accept the solicited response and restored the public address. So the pattern became:

- solicited/unicast RA after `renew6`: accepted
- unsolicited/multicast RA to `ff02::1`: visible in tshark, but not applied by Windows

That smelled like local filtering.

## Firewall rule store

The active firewall store barely had any ICMPv6 rules:

```powershell
Get-NetFirewallRule -PolicyStore ActiveStore |
  ForEach-Object {
    $rule = $_
    $port = $rule | Get-NetFirewallPortFilter
    if ($port.Protocol -eq "ICMPv6" -or $port.Protocol -eq 58) {
      [pscustomobject]@{
        DisplayName = $rule.DisplayName
        Enabled = $rule.Enabled
        Direction = $rule.Direction
        Action = $rule.Action
        Profile = $rule.Profile
        Protocol = $port.Protocol
        IcmpType = $port.IcmpType
      }
    }
  } | Format-Table -Auto
```

This showed only Teredo ICMPv6 echo rules. No Router Advertisement rule.

The system default store did contain the expected built-in rule:

```powershell
Get-NetFirewallRule -PolicyStore SystemDefaults |
  Where-Object { $_.DisplayName -match "Router Advertisement" } |
  Format-Table -Auto DisplayName,Enabled,Direction,Action,Profile
```

That showed:

```text
Core Networking - Router Advertisement (ICMPv6-In)
```

So Windows knew the default rule, but it was missing from the active policy. That explained why `tshark` could see the Ethernet frames while the IPv6 stack did not refresh the address from unsolicited RAs.

## Proof

As a temporary test, I added an inbound allow rule for ICMPv6 Router Advertisement, type 134:

```powershell
New-NetFirewallRule `
  -DisplayName "Codex temporary allow ICMPv6 Router Advertisement" `
  -Direction Inbound `
  -Action Allow `
  -Protocol ICMPv6 `
  -IcmpType 134 `
  -Profile Any
```

After that, the same multicast RAs started refreshing the Windows lifetime back to around 600 seconds. The address stopped counting down to death.

That made the root cause clear: Windows Firewall active policy was filtering or omitting inbound ICMPv6 Router Advertisements.

## Permanent fix

I added a narrower permanent rule that only accepts Router Advertisements from link-local IPv6 sources:

```powershell
New-NetFirewallRule `
  -DisplayName "Allow ICMPv6 Router Advertisement for IPv6 SLAAC" `
  -Direction Inbound `
  -Action Allow `
  -Protocol ICMPv6 `
  -IcmpType 134 `
  -RemoteAddress "fe80::/10" `
  -Profile Any `
  -Description "Allows IPv6 Router Advertisements from link-local routers so SLAAC public IPv6 addresses are refreshed."
```

Verify it:

```powershell
Get-NetFirewallRule -DisplayName "Allow ICMPv6 Router Advertisement for IPv6 SLAAC" |
  Format-List DisplayName,Enabled,Direction,Action,Profile

Get-NetFirewallRule -DisplayName "Allow ICMPv6 Router Advertisement for IPv6 SLAAC" |
  Get-NetFirewallPortFilter |
  Format-List Protocol,IcmpType

Get-NetFirewallRule -DisplayName "Allow ICMPv6 Router Advertisement for IPv6 SLAAC" |
  Get-NetFirewallAddressFilter |
  Format-List RemoteAddress
```

Expected:

```text
Enabled: True
Direction: Inbound
Action: Allow
Protocol: ICMPv6
IcmpType: 134
RemoteAddress: fe80::/10
```

After installing the rule, the public IPv6 address stayed alive and the lifetime refreshed on periodic multicast RAs.

## Notes

Do not blindly disable IPv6 to fix this. SLAAC depends on ICMPv6 Router Advertisements. Blocking them breaks normal IPv6 address maintenance in a way that looks like a DHCP or router lifetime problem.

Also, `tshark` seeing packets does not mean the Windows IPv6 stack is applying them. Packet capture can prove the frames reach the NIC. It does not prove higher layers are allowed to consume them.
