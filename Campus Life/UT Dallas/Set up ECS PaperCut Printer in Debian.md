The ECS Printing service has a PaperCut MF set up and is authenticated against the UTD NetID and password. There lacks necessary documentation to set this up.

## Web Service

The PaperCut MF web dashboard is available at:

http://ecsprint.campus.ad.utdallas.edu:9191/

Login with the UTD NetID and password. This can be used to check balances, do web print and cancel jobs.

## Debian CUPS

Ensure the CUPS, `samba-client` and printer drivers are installed

```bash
sudo apt install cups samba-client printer-driver-all
```

If you are using your own OS, configure the workgroup to be under the campus domain.

Edit `/etc/samba/smb.conf`, and change the line

```
workgroup = WORKGROUP
```

to

```
workgroup = CAMPUS.AD.UTDALLAS.EDU
```

Then navigate to http://localhost:631, go to _Administration_, click on _Add Printer_, and then choose _Windows Printer via SAMBA_. In the _Connection_ field, fill in `smb://ecsprint.campus.ad.utdallas.edu/ecsqueue`. Fill in other fields as appropriate. Note that the printer name cannot have spaces in it. For the Driver field, choose  `Generic` and then `Generic PostScript Printer Foomatic/Postscript (recommended)`.

At this point, you should be able to find the printer in Debian settings. Print a test page and when it asks for authentication, fill in UTD NetID and Password.
