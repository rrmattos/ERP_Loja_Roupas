declare module 'leo-profanity' {
  interface LeoProfanity {
    loadDictionary(name?: string): void;
    getDictionary(name?: string): string[];
    addDictionary(name: string, words: string[]): LeoProfanity;
    removeDictionary(name: string): LeoProfanity;
    list(): string[];
    check(text: string): boolean;
    clean(text: string, replaceChar?: string): string;
    add(words: string | string[]): LeoProfanity;
    remove(words: string | string[]): LeoProfanity;
    reset(): LeoProfanity;
    clearList(): LeoProfanity;
    addWhitelist(words: string | string[]): LeoProfanity;
    removeWhitelist(words: string | string[]): LeoProfanity;
    clearWhitelist(): LeoProfanity;
    getWhitelist(): string[];
  }

  const filter: LeoProfanity;
  export default filter;
}
