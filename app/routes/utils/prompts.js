export const youtubeSummaryPrompt = `
Summarize the YouTube video at this link: {{videoUrl}}
You are given a YouTube demo video for the product "{{title}}" by "{{vendor}}", which is a {{type}}.
Your task is to:
1. Watch and understand the content of this single video.
2. Write a concise, sales-focused summary that highlights the product's value.
3. Identify 3-5 key highlights with timestamps showing important demo moments.

Output strictly in this JSON format:
{
  "youtube_url": "{{videoUrl}}",
  "summary": "Brief but compelling summary of the product demo.",
  "highlights": [
    { "label": "Key feature shown", "timestamp": "1:15" },
    { "label": "Important demo moment", "timestamp": "2:42" }
  ]
}

If the video is unavailable, broken, or irrelevant, return:
{ "error": "Unable to process this video." }
`;



export function formatPrompt(template, data) {
  return template
    .replace(/{{videoUrl}}/g, data.youtube_url)
    .replace(/{{title}}/g, data.title)
    .replace(/{{vendor}}/g, data.vendor)
    .replace(/{{type}}/g, data.product_type);
}