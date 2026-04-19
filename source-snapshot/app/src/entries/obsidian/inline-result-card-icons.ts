import arrowUpIcon from '@memex/common/files/icons/arrowUp.svg?inline'
import bookmarkIcon from '@memex/common/files/icons/bookmark.svg?inline'
import calendarIcon from '@memex/common/files/icons/calendar.svg?inline'
import copyIcon from '@memex/common/files/icons/copy.svg?inline'
import dotsIcon from '@memex/common/files/icons/3dots.svg?inline'
import facebookIcon from '@memex/common/files/icons/facebook.svg?inline'
import fileIcon from '@memex/common/files/icons/file.svg?inline'
import globeIcon from '@memex/common/files/icons/globe.svg?inline'
import goToIcon from '@memex/common/files/icons/open.svg?inline'
import hashtagIcon from '@memex/common/files/icons/hash.svg?inline'
import heartEmptyIcon from '@memex/common/files/icons/heart_empty.svg?inline'
import linkIcon from '@memex/common/files/icons/link.svg?inline'
import redditIcon from '@memex/common/files/icons/reddit.svg?inline'
import reloadIcon from '@memex/common/files/icons/reload.svg?inline'
import removeXIcon from '@memex/common/files/icons/removeX.svg?inline'
import retweetIcon from '@memex/common/files/icons/retweet.svg?inline'
import starsIcon from '@memex/common/files/icons/stars.svg?inline'
import tiktokLogoIcon from '@memex/common/files/icons/tiktok.svg?inline'
import trashIcon from '@memex/common/files/icons/trash.svg?inline'
import trayIcon from '@memex/common/files/icons/tray.svg?inline'
import warningIcon from '@memex/common/files/icons/alertRound.svg?inline'
import xLogoIcon from '@memex/common/files/icons/x_logo_2023.svg?inline'
import youtubeLogoIcon from '@memex/common/files/icons/youtube-logo.svg?inline'

const asSvgDataUrl = (svgMarkup: string): string =>
    `data:image/svg+xml;utf8,${encodeURIComponent(svgMarkup)}`

export const OBSIDIAN_INLINE_RESULT_CARD_ICONS: Record<string, string> = {
    '/public/files/icons/3dots.svg': asSvgDataUrl(dotsIcon),
    '/public/files/icons/alertRound.svg': asSvgDataUrl(warningIcon),
    '/public/files/icons/arrowUp.svg': asSvgDataUrl(arrowUpIcon),
    '/public/files/icons/bookmark.svg': asSvgDataUrl(bookmarkIcon),
    '/public/files/icons/calendar.svg': asSvgDataUrl(calendarIcon),
    '/public/files/icons/copy.svg': asSvgDataUrl(copyIcon),
    '/public/files/icons/facebook.svg': asSvgDataUrl(facebookIcon),
    '/public/files/icons/file.svg': asSvgDataUrl(fileIcon),
    '/public/files/icons/globe.svg': asSvgDataUrl(globeIcon),
    '/public/files/icons/hash.svg': asSvgDataUrl(hashtagIcon),
    '/public/files/icons/heart_empty.svg': asSvgDataUrl(heartEmptyIcon),
    '/public/files/icons/link.svg': asSvgDataUrl(linkIcon),
    '/public/files/icons/open.svg': asSvgDataUrl(goToIcon),
    '/public/files/icons/reddit.svg': asSvgDataUrl(redditIcon),
    '/public/files/icons/reload.svg': asSvgDataUrl(reloadIcon),
    '/public/files/icons/removeX.svg': asSvgDataUrl(removeXIcon),
    '/public/files/icons/retweet.svg': asSvgDataUrl(retweetIcon),
    '/public/files/icons/stars.svg': asSvgDataUrl(starsIcon),
    '/public/files/icons/tiktok.svg': asSvgDataUrl(tiktokLogoIcon),
    '/public/files/icons/trash.svg': asSvgDataUrl(trashIcon),
    '/public/files/icons/tray.svg': asSvgDataUrl(trayIcon),
    '/public/files/icons/x_logo_2023.svg': asSvgDataUrl(xLogoIcon),
    '/public/files/icons/youtube-logo.svg': asSvgDataUrl(youtubeLogoIcon),
}
