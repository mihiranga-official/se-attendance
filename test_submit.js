const https = require('https');
const querystring = require('querystring');

const postData = querystring.stringify({
  'entry.1711473520': 'Test User',
  'entry.1809901273': 'IT',
  'entry.1524728558': 'Rice with Egg (Rs. 150 )',
  'fvv': '1',
  'pageHistory': '0',
});

const options = {
  hostname: 'docs.google.com',
  port: 443,
  path: '/forms/d/e/1FAIpQLSdoPrpw7Ybg5jujOEtAqcTCyTU2z7VRBdxeWoi6BTwLbnm7dg/formResponse',
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': postData.length
  }
};

const req = https.request(options, (res) => {
  console.log('STATUS:', res.statusCode);
  console.log('HEADERS:', res.headers);
  res.on('data', (d) => {
    process.stdout.write(d);
  });
});

req.on('error', (e) => {
  console.error(e);
});

req.write(postData);
req.end();
