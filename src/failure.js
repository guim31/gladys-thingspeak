// -----------------------------------------------------------------------------
// Gladys shows in green what an action handler returns, in red what it throws:
// every failure throws an ActionFailure, whose message is the multi-language
// object Gladys shows in the language of the user.
// -----------------------------------------------------------------------------

export class ActionFailure extends Error {
  /** @param {{ en: string, fr: string, de: string, es: string }} text */
  constructor(text) {
    super(text.en);
    this.message = text;
  }
}
