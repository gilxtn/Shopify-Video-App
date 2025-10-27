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


export const youtubeVideoPrompt = `Find the best demo video on YouTube of the product "{{title}}" by "{{vendor}}", specifically a "{{type}}".
This main video is required and must be returned.
Also return 4–6 additional relevant demo videos whenever available (Fewer than 4 should only if truly unavailable, private, or broken).
Prioritize official brand channels and high-quality demos.
Avoid unboxing or long reviews unless they clearly demonstrate the product.
Only return videos with transcripts (for later analysis).
Don't return videos with a negative opinion about the product.

Output format when a video is found:
{
  "youtube_url": "https://youtube.com/embed/...",
  "summary": "Brief sales-style summary based on the video.",
  "highlights": [
    { "label": "Key moment 1", "timestamp": "1:22" },
    { "label": "Key moment 2", "timestamp": "3:10" }
  ],
   "other_videos": [
   { "youtube_url": "https://youtube.com/embed/abc123xyz01" },
    { "youtube_url": "https://youtube.com/embed/def456uvw02" },
    { "youtube_url": "https://youtube.com/embed/ghi789rst03" },
     { "youtube_url": "https://youtube.com/embed/jkl012opq04" }
    // minimum 4 and maximum 6 entries if possible
  ]
}

Only return this error format if the main video is confirmed to be unavailable:
{ "error": "YouTube URL not found for this video." }`;

