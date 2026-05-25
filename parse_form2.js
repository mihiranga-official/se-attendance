const fs = require('fs');
const html = fs.readFileSync('C:/Users/LENOVO/.gemini/antigravity/brain/9da8f4f2-ec83-421f-8cc4-03dd61e70805/.system_generated/steps/2840/content.md', 'utf8');

const match = html.match(/var FB_PUBLIC_LOAD_DATA_ = (.*?);<\/script>/);
if (match) {
  try {
    const data = JSON.parse(match[1]);
    const fields = data[1][1];
    fields.forEach(field => {
        console.log(`Field Title: ${field[1]}`);
        if (field[4] && field[4][0]) {
            console.log(`Field ID: entry.${field[4][0][0]}`);
            if (field[4][0][1]) {
                console.log(`Options:`, field[4][0][1].map(o => o[0]));
            }
        }
        console.log('---');
    });
  } catch (e) {
      console.error(e);
  }
} else {
    console.log("No FB_PUBLIC_LOAD_DATA_ found");
}
