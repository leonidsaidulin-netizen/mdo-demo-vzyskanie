export const TEMPLATE_FIELDS=['title','body','company','address','account','people','caseId','period','amount','remaining','principal','penalty','fee','date','calculation'];
const xml=s=>String(s).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
const paragraph=text=>`<w:p><w:r><w:t xml:space="preserve">${xml(text)}</w:t></w:r></w:p>`;
const WARNING='УЧЕБНЫЙ ДОКУМЕНТ. СИНТЕТИЧЕСКИЕ ДАННЫЕ. НЕ ДЛЯ ОТПРАВКИ И ПОДАЧИ.';
export function baseTemplate(Zip){
  const zip=new Zip();
  zip.file('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml',`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraph('{title}')}${paragraph('{body}')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:bottom="1134" w:left="1134" w:right="1134"/></w:sectPr></w:body></w:document>`);
  return zip;
}
export function validateTemplate(zip){
  if(!zip.file('word/document.xml'))throw Error('Нужен DOCX, не DOC или PDF');
  let size=0;
  for(const [name,f] of Object.entries(zip.files)){
    size+=f._data?.uncompressedSize||0;
    if(size>4*1024*1024)throw Error('Распакованный шаблон больше 4 МБ');
    if(/vbaProject|embeddings|activeX/i.test(name))throw Error('Макросы и вложенные объекты запрещены');
    if(name.endsWith('.rels')&&/TargetMode\s*=\s*["']External/i.test(f.asText()))throw Error('Внешние ссылки в шаблоне запрещены');
  }
}
export function renderDocx(draft,{Zip,Templater},custom){
  const zip=custom?new Zip(custom,{base64:typeof custom==='string'}):baseTemplate(Zip);validateTemplate(zip);
  const path='word/document.xml',source=zip.file(path).asText();
  zip.file(path,source.replace(/(<w:body[^>]*>)/,`$1${paragraph(WARNING)}`));
  const data={...draft.data,title:draft.title,body:draft.text};
  for(const k of ['amount','remaining','principal','penalty','fee'])data[k]=new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB'}).format((data[k]||0)/100);
  const doc=new Templater(zip,{paragraphLoop:true,linebreaks:true,nullGetter:part=>{throw Error(`Неизвестное поле шаблона: ${part.value}`);}});
  doc.render(Object.fromEntries(TEMPLATE_FIELDS.map(k=>[k,data[k]??''])));
  return doc.getZip().generate({type:'uint8array',compression:'DEFLATE'});
}
export function templateBytes(Zip){return baseTemplate(Zip).generate({type:'uint8array',compression:'DEFLATE'});}
