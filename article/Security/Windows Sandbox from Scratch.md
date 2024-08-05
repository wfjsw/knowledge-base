---
status: Drafts
---
# Implement a Sandbox on Windows from Scratch


> [!WARNING] Warning
> The article is incomplete as of now, while the code is still under development.

## Motivations

Someone put trojans into [an extension][1] through malicious pip packages. Honestly speaking, this is not surprising at all, as the entire extension system is built upon unlimited Python code execution, and security on this crap is a lost cause. 

Someone says that everyone should use Docker or Sandboxie. That's a great suggestion, except that it is not super practical for non-experts. [[Python Launching|Launching the Python]] is hard enough, and why extra burden? In addition to that, Docker requires WSL and Sandboxie requires configuration, subscription and kernel drivers. I don't think they justify this case.

## Deny somethings
### Restricted Token

### AppContainers (LowBox)

## Grant somethings

### Windows DACL

### One Broker Way

## Conclusion

## References

- [PSA: If you've used the ComfyUI_LLMVISION node from u/AppleBotzz, you've been hacked][1]

[1]: https://www.reddit.com/r/comfyui/comments/1dbls5n/psa_if_youve_used_the_comfyui_llmvision_node_from/
