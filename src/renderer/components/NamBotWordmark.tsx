import type { JSX } from 'react'

export default function NamBotWordmark({ className = '', animated = false }: { className?: string; animated?: boolean }): JSX.Element {
  const wordmark = <span className={`nam-bot-wordmark ${className}`.trim()}>NAM-BOT</span>
  return animated ? <span className="nam-bot-brand" tabIndex={0}>{wordmark}</span> : wordmark
}
