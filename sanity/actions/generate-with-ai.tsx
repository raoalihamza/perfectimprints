// TODO: M5-505 - Studio action that appears on customCategory documents.
// On click, POSTs title+targetKeyword to /api/sanity/generate-content,
// then patches introHtml and faqs fields with the DeepSeek response.

import type { DocumentActionComponent } from 'sanity';

export const generateWithAi: DocumentActionComponent = (_props) => {
  return {
    label: 'Generate with AI',
    disabled: true,
    onHandle: () => {
      // TODO M5-505
    },
  };
};
