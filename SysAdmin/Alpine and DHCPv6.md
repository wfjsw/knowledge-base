When it comes to DHCPv6, Alpine might not be your first choice. Proxmox VE is still accusing the udhcpc6 in BusyBox, a DHCP implementation used by Alpine is [unfinished and broken](https://github.com/proxmox/pve-container/blob/bd401aced1e58ea724fadcde73a3a5a8bb6d4abc/src/PVE/LXC/Setup/Alpine.pm#L74-L83) since early 2016, and all interfaces marked as `dhcp` is automatically turned into `manual` mode. While I have not really dig into whether the udhcpc6 in Alpine actually works or not, changing the `/etc/network/interfaces` to again mark the interface as `dhcp` does not do its magic. Alternatively, I will need to install another DHCP client for the purpose.

From the Proxmox VE [source code](https://github.com/proxmox/pve-container/blob/bd401aced1e58ea724fadcde73a3a5a8bb6d4abc/src/PVE/LXC/Setup/Alpine.pm#L70-L83): 
```perl
sub setup_network {
    # Network is debian compatible, but busybox' udhcpc6 is unfinished
    my ($self, $conf) = @_;

    # XXX: udhcpc6 in busybox is broken; once a working alpine release comes
    # we can remove this bit.
    #
    # Filter out ipv6 dhcp and turn it into 'manual' so they see what's up.
    #
    # XXX: slaac works different from debian - busybox has no 'auto'
    # configuration type - https://wiki.alpinelinux.org/wiki/Configure_Networking#IPv6_Stateless_Autoconfiguration
    # the suggested configuration sadly does not take the interface up, but
    # at least with the workaround the networking starts and if an ipv4 is
    # configured slaac for ipv6 works (unless accept_ra = 0 in the node)

```

A bit of search turns that there is another implementation `dhcpcd` where it allows full-featured DHCPv4 + DHCPv6 + SLAAC. As a plus (it might be annoying for other users), it would not read the `/etc/network/interfaces` file, so the problematic PVE-generated file will not obstruct this client from running. Instead, a config file `/etc/dhcpcd.conf` is then used. 

It is worth noting that, despite `dhcpcd` will install its own service daemon config, it is better off not using them, and it will create problems. Instead, let it launch with the `networking`service instead.