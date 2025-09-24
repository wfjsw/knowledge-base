---
status: Drafts
---



> [!WARNING] Warning
> The article is incomplete as of now, while the code is still under development.

## Motivations

Someone put Trojans into [an extension][1] through malicious pip packages that steals cookies and passwords. Honestly speaking, this is not surprising at all, as the entire extension system is built upon unlimited Python code execution, and security on this crap is a lost cause. 

Someone says that everyone should use Docker or Sandboxie. That's a great suggestion, except that it is not super practical for non-experts. [[Launch the Python in the Hard Way|Launching the Python]] is hard enough, and why extra burden? In addition to that, Docker requires WSL and Sandboxie requires configuration, subscription and kernel drivers. I don't think they justify this case.

So here I am, trying to put together a portable sandbox without having to resort to kernel side. (It is expensive to deploy a kernel-mode driver!)

## Deny something

The core functionality of the sandbox would be to prevent the application from accessing data that it is not supposed to. For example, your music player should not be able to browse your photo library. Normally speaking, every 3rd-party application you run on your machine has the same privileges as your login account, including all cookies in your web browser store, even though the web browser itself is properly protected from malicious activity inside the webpage. So we need to find out a way to deny access to these important stuff.

### Restricted Token

The right of a process is controlled by something called [access token][2]. The token tells the OS about who you are, through a list of [security identifiers (SID)][3]. You might have already seen some SIDs in the wild, such as `S-1-5-21-1791070911-936258494-3081842131`. For the time being, view it as a unique identifier to either a single user or a user group (for example, Administrators). 

An access token is created when a user login. When a new process is created, normally the child process will inherit the access token that the parent process hold. Through this way, most of the processes bears the same access token. However, by using the [CreateRestrictedToken][4] API, Windows allows us\to create a token with significantly less permissions. In the creation process, we can selectively choose which SIDs we want to be left in the token and which ones we want to get rid of. In addition to that, we can also remove unnecessary privileges, such as `SeShutdownPrivilege` which is included in the token by default, and in turns reduce the attack surface by a large margin. After created a suitable token, we can then use [CreateProcessAsUser][5] API to apply the new token to the process we want.

We are free to remove SIDs that we do not use. Most of the access will be gone when the current user and the logon session are removed. To ensure these SIDs won't be used at all, they can be added to the Deny Only SIDs list, which once set, is unable to change later. It is worth noting that adding a NULL SID to the restricting list effectively turns off all SIDs in the token and it will have no access to almost everything.

Note that we may not want to use [CreateProcessWithTokenW][6] even though the name looks satisfying. This API uses the Secondary Logon service for spawning the process, so the process will ends up out of our control.

### AppContainers (LowBox)

An AppContainer can be seen as an enhanced version of a restricted token.

## Grant something

### Windows DACL

### One Broker Way

## Conclusion

## References


[1]: https://www.reddit.com/r/comfyui/comments/1dbls5n/psa_if_youve_used_the_comfyui_llmvision_node_from/
[2]: https://learn.microsoft.com/en-us/windows/win32/secauthz/access-tokens
[3]: https://learn.microsoft.com/en-us/windows/win32/secauthz/security-identifiers
[4]: https://learn.microsoft.com/en-us/windows/win32/api/securitybaseapi/nf-securitybaseapi-createrestrictedtoken
[5]:https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-createprocessasusera
[6]:https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-createprocesswithtokenw