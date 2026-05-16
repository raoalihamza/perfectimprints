// TODO: M5-505 - DeepSeek client for Sanity AI button.
// Called server-side by /app/api/sanity/generate-content/route.ts.

export interface GenerateContentInput {
  title: string;
  targetKeyword: string;
}

export interface GenerateContentResult {
  introHtml: string;
  faqs: Array<{ q: string; a: string }>;
}

export async function generateRootCategoryContent(
  _input: GenerateContentInput,
): Promise<GenerateContentResult> {
  // TODO M5-505
  throw new Error('generateRootCategoryContent not yet implemented - see TASKS.md M5-505');
}
