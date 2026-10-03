const fs = require('fs');

let admin = fs.readFileSync('src/components/community/CommunityHashtagAdmin.tsx', 'utf8');
admin = admin.replace(
  /\s*<div className="admin-hashtag-heading">\s*<div>\s*<h3>Hashtag requests<\/h3>\s*<small>.*?<\/small>\s*<\/div>\s*<span>\{requests\.length\}<\/span>\s*<\/div>\s*/g,
  '\n\n'
);
fs.writeFileSync('src/components/community/CommunityHashtagAdmin.tsx', admin, 'utf8');

let manager = fs.readFileSync('src/components/community/CommunityHashtagManager.tsx', 'utf8');
manager = manager.replace(
  /<header className="admin-hashtag-manager-heading"><div><h3>Approved hashtags<\/h3><small>New hashtags also fulfill matching requests from members\.<\/small><\/div>\s*<button type="button" disabled=\{Boolean\(setupError\)\|\|busy\|\|working\} onClick=\{\(\)=>startEdit\(\)\}><Plus size=\{13\}\/> Add<\/button>\s*<\/header>/g,
  '<header className="flex justify-end mb-3"><button type="button" disabled={Boolean(setupError)||busy||working} onClick={()=>startEdit()} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-[10px] font-bold text-on-primary"><Plus size={13}/> Add</button></header>'
);
fs.writeFileSync('src/components/community/CommunityHashtagManager.tsx', manager, 'utf8');
