interface CharacterIdentity { id?: string | null; conversationId?: string | null }

/** No draft, stale character, or in-flight creation may open the game context. */
export function canShowCharacterContext(
  character: CharacterIdentity | null | undefined,
  conversationId: string | null,
  creating: boolean,
): boolean {
  return !creating && Boolean(conversationId && character?.id && character.conversationId === conversationId);
}
