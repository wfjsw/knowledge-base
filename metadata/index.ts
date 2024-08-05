import type { Creator } from '../scripts/types/metadata'
import { getAvatarUrlByGithubName } from '../scripts/utils'

/** 文本 */
export const siteName = 'ByteSized Insights'
export const siteShortName = 'ByteSized Insights'
export const siteDescription = 'Jabasukuriputo\'s Dev Blog'

/** 文档所在目录 */
export const include = ['article']

/** Repo */
export const githubRepoLink = 'https://github.com/wfjsw/devblogs'
/** Discord */
// export const discordLink = 'https://discord.gg/XuNFDcDZGj'

/** 无协议前缀域名 */
export const plainTargetDomain = 'devblogs.jsw3286.eu.org'
/** 完整域名 */
export const targetDomain = `https://${plainTargetDomain}`

/** 创作者 */
export const creators: Creator[] = [
  {
    name: 'Jianshu Wang',
    avatar: '',
    username: 'wfjsw',
    title: '',
    desc: '',
    links: [
      { type: 'github', icon: 'github', link: 'https://github.com/wfjsw' },
    ],
    nameAliases: [],
    emailAliases: [],
  },
].map<Creator>((c) => {
  c.avatar = c.avatar || getAvatarUrlByGithubName(c.username)
  return c as Creator
})

export const creatorNames = creators.map(c => c.name)
export const creatorUsernames = creators.map(c => c.username || '')
