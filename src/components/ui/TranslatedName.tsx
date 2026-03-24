/**
 * Renders a translated name where the parenthesized English translation
 * is shown in lighter/italic style. Works with td() output like "Translit (Translation)".
 * For Russian lang or names without parentheses, renders as-is.
 */
export function TranslatedName({ name, className }: { name: string; className?: string }) {
  const match = name.match(/^(.+?)\s*\((.+)\)$/)
  if (!match) return <span className={className}>{name}</span>
  return (
    <span className={className}>
      {match[1]} <span className="font-normal italic text-gray-500">({match[2]})</span>
    </span>
  )
}
