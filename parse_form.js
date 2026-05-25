const fs = require('fs');
const html = fs.readFileSync('C:/Users/LENOVO/.gemini/antigravity/brain/9da8f4f2-ec83-421f-8cc4-03dd61e70805/.system_generated/steps/2840/content.md', 'utf8');
const matches = [...html.matchAll(/entry\.\d+/g)];
console.log('Entries:', [...new Set(matches.map(m => m[0]))]);
const fbzxMatch = html.match(/name="fbzx"\s+value="([^"]+)"/);
console.log('fbzx:', fbzxMatch ? fbzxMatch[1] : null);
const emailMatch = html.match(/emailAddress/i);
console.log('email field exists:', !!emailMatch);
