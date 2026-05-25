const https = require('https');
const querystring = require('querystring');

const formUrl = 'https://docs.google.com/forms/d/e/1FAIpQLSdoPrpw7Ybg5jujOEtAqcTCyTU2z7VRBdxeWoi6BTwLbnm7dg/viewform';
const submitUrl = '/forms/d/e/1FAIpQLSdoPrpw7Ybg5jujOEtAqcTCyTU2z7VRBdxeWoi6BTwLbnm7dg/formResponse';

const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36';

https.get(formUrl, { headers: { 'User-Agent': userAgent } }, (res) => {
  let html = '';
  res.on('data', d => html += d);
  res.on('end', () => {
    const fbzxMatch = html.match(/name="fbzx"\s+value="([^"]+)"/);
    const fbzx = fbzxMatch ? fbzxMatch[1] : '';
    console.log('Got fbzx:', fbzx);
    
    // Also grab cookies if any
    const cookies = res.headers['set-cookie'];
    console.log('Got cookies:', cookies);

    const postData = querystring.stringify({
      'entry.1711473520': 'Test User',
      'entry.1809901273': 'IT',
      'entry.1524728558': 'Rice with Egg (Rs. 150 )',
      'fvv': '1',
      'pageHistory': '0',
      'fbzx': fbzx
    });

    const options = {
      hostname: 'docs.google.com',
      port: 443,
      path: submitUrl,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': postData.length,
        'User-Agent': userAgent,
        'Cookie': cookies ? cookies.map(c => c.split(';')[0]).join('; ') : ''
      }
    };

    const req = https.request(options, (res2) => {
      console.log('STATUS:', res2.statusCode);
      let resHtml = '';
      res2.on('data', (d) => resHtml += d);
      res2.on('end', () => console.log('Done, length:', resHtml.length));
    });
    req.write(postData);
    req.end();
  });
});
