---
tags: []
---
# Untagged

```dataview
TABLE
	file.path AS "路径"
FROM "笔记"
WHERE length(file.tags) = 0
```

