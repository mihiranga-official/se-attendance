const https = require('https');
const querystring = require('querystring');

const formUrl = 'https://docs.google.com/forms/d/e/1FAIpQLSdoPrpw7Ybg5jujOEtAqcTCyTU2z7VRBdxeWoi6BTwLbnm7dg/viewform';
const submitUrl = '/forms/d/e/1FAIpQLSdoPrpw7Ybg5jujOEtAqcTCyTU2z7VRBdxeWoi6BTwLbnm7dg/formResponse';

https.get(formUrl, (res) => {
  let html = '';
  res.on('data', d => html += d);
  res.on('end', () => {
    const fbzxMatch = html.match(/name="fbzx"\s+value="([^"]+)"/);
    const fbzx = fbzxMatch ? fbzxMatch[1] : '';
    console.log('Got fbzx:', fbzx);

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
        'Content-Length': postData.length
      }
    };

    const req = https.request(options, (res2) => {
      console.log('STATUS:', res2.statusCode);
      res2.on('data', () => {});
      res2.on('end', () => console.log('Done'));
    });
    req.write(postData);
    req.end();
  });
});
