// src/lib/domains.js — Domain suggestion and normalization utilities

/**
 * Generate domain suggestions from a business name.
 * Handles Greek business naming patterns (strips location suffixes).
 *
 * @param {string} name - Business name (e.g. from Google Maps)
 * @returns {string[]} - Array of suggested domain names with .gr and .com TLDs
 */
export function generateDomainSuggestions(name) {
  if (!name || typeof name !== 'string') return []

  // 1. Strip location suffix after " - " or ", "
  let cleaned = name.split(' - ')[0].split(', ')[0].trim()

  // 2. Lowercase
  cleaned = cleaned.toLowerCase()

  // 3. Remove non-alphanumeric characters (keep hyphens)
  cleaned = cleaned.replace(/[^a-z0-9-]/g, '')

  // Remove leading/trailing hyphens and collapse multiple hyphens
  cleaned = cleaned.replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-')

  if (!cleaned) return []

  // 4. Generate word-based variants from the original (pre-cleaned) name
  //    Split the stripped name into words for variant generation
  const strippedName = name.split(' - ')[0].split(', ')[0].trim()
  const words = strippedName.toLowerCase().split(/\s+/)
  const cleanWord = (w) => w.replace(/[^a-z0-9-]/g, '')
  const cleanedWords = words.map(cleanWord).filter(Boolean)

  const variants = new Set()

  // Full cleaned name (all words joined)
  variants.add(cleaned)

  // First two words joined (if more than one word)
  if (cleanedWords.length >= 2) {
    const firstTwo = cleanedWords.slice(0, 2).join('')
    if (firstTwo) variants.add(firstTwo)
  }

  // First word only (if more than one word)
  if (cleanedWords.length >= 2) {
    const firstWord = cleanedWords[0]
    if (firstWord) variants.add(firstWord)
  }

  // 5. Append .gr and .com TLDs to each variant, deduplicate
  const suggestions = []
  for (const variant of variants) {
    suggestions.push(`${variant}.gr`)
    suggestions.push(`${variant}.com`)
  }

  return suggestions
}

/**
 * Normalize a domain input — trim, lowercase, append .gr if no TLD present.
 *
 * @param {string} input - Raw domain input from user
 * @returns {string} - Normalized domain string
 */
export function normalizeDomain(input) {
  const trimmed = input.trim().toLowerCase()
  if (!trimmed.includes('.')) return `${trimmed}.gr`
  return trimmed
}
