## Driver

Install driver according to the suggestion outlined [in this GitHub issue comment](https://github.com/ROCm/ROCm/issues/5111#issuecomment-3288690022)

> My system is Debian 13 with the `6.12.43+deb13-amd64` kernel. I successfully built AMD GPU driver with the following parameters.
> 
> APT config `/etc/apt/sources.list.d/amdgpu.list`:
> 
> ```
> deb [arch=amd64,i386 signed-by=/etc/apt/keyrings/rocm.gpg] https://repo.radeon.com/amdgpu/6.4.3/ubuntu noble main
> ```
> 
> For more details, visit [the official AMD page](https://rocm.docs.amd.com/projects/install-on-linux/en/latest/install/quick-start.html).
> 
> Create the correct directory for the kernel headers:
> 
> ```
> mkdir -p /usr/src/ofa_kernel/x86_64/
> ln -s /usr/src/linux-headers-`uname -r` /usr/src/ofa_kernel/x86_64/`uname -r`
> ```
> 
> Change the current kernel version for amdgpu:
> 
> ```
> uname -r | tee /var/tmp/amdgpu-dkms-kernels
> ```
> 
> Build the amdgpu kernel module:
> 
> ```
> export SRCARCH=x86
> dpkg-reconfigure amdgpu-dkms
> ```

**UPDATE:**
Note that it would get quite annoying when:
- You install both NVIDIA and AMD drivers
- There is a Linux kernel update.

Basically at that time, AMD and NVIDIA driver will both attempt to build, and the changes made for AMD will break NVIDIA. A way to do this is:

1. Run `apt upgrade` first, and notice that `dpkg` is in a broken state.
2. Run `SRCARCH=x86 apt install -f` to try to build the AMD module. It will fail again, but this time on NVIDIA.
3. Temporarily hide the `/usr/src/ofa_kernel` folder. Then run `apt install -f` again to build NVIDIA driver. Note this time the `SRCARCH` environment variable is not set. They will be installed after they are successfully built.
4. Clean up and undo the hide. 
5. Profit.

## ROCm

### Install

Install ROCm using Ubuntu `noble` source.

Need to mock `libstdc++-11-dev` and `libgcc-11-dev` using `equivs-build`. Did not find anything that is adversely affected by this:

`libstdc++-11-dev.equivs`
```
Package: libstdc++-11-dev
Version: 99.99
Maintainer: Your Name <mail@domain.com>
Architecture: all
Description: dummy libstdc++-11-dev package
 A dummy package with a version number so high that the real gnome packages
 will never reach it.
```

`libgcc-11-dev.equivs`
```
Package: libgcc-11-dev
Version: 99.99
Maintainer: Your Name <mail@domain.com>
Architecture: all
Description: dummy libgcc-11-dev package
 A dummy package with a version number so high that the real gnome packages
 will never reach it.
```

### Fix ROCgdb

Noticed that the `rocgdb` crashes with SEGV. Debian 13 ships Python 3.13 and Ubuntu 24 ships Python 3.12. Apparently there are native modules in ROCm that rely on Python 3.12.

Install Python 3.12 through whatever other means, and create a symlink from `python3.12/lib/libpython3.12.so` to `rocm/lib/amdpythonlib.so`. 

This is derived from [another issue comment](https://github.com/ROCm/ROCgdb/issues/32#issuecomment-2602896045).