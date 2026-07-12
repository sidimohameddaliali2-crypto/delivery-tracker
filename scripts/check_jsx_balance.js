const fs = require('fs');
const path = require('path');
const file = path.resolve(process.argv[2] || 'client/src/components/DispatcherMapAssignModal.jsx');
const s = fs.readFileSync(file,'utf8');
function countPairs(str, open, close){
  let count = 0; let max = 0;
  for(const ch of str){
    if(ch === open) count++;
    if(ch === close) count--;
    if(count>max) max=count;
  }
  return {balance: count, maxDepth: max};
}
console.log('file:', file);
console.log('brace {}:', countPairs(s,'{','}'));
console.log('paren ():', countPairs(s,'(',')'));
console.log('bracket []:', countPairs(s,'[',']'));

// Quick find of unmatched JSX-looking constructs: count '<' and '>' outside JS expressions roughly
let lt=0, gt=0;
for(let i=0;i<s.length;i++){
  if(s[i] === '<') lt++;
  if(s[i] === '>') gt++;
}
console.log('< vs >:', lt, gt);

// Print lines around likely error location
const lines = s.split(/\r?\n/);
for(let ln=Math.max(0, lines.length-60); ln<lines.length; ln++){
  console.log((ln+1).toString().padStart(4)+': '+lines[ln]);
}
