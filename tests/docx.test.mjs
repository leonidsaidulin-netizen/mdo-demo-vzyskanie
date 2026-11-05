import test from 'node:test';
import assert from 'node:assert/strict';
import Zip from 'pizzip';
import Templater from 'docxtemplater';
import {renderDocx,baseTemplate,templateBytes} from '../dist/docx.mjs';
const draft={title:'Тест <&>',text:'Первая строка\nВторая строка',data:{account:'УЧ-001',amount:539258,fee:200000}};
test('DOCX opens as valid ZIP with exact data, linebreaks and forced demo watermark',()=>{const bytes=renderDocx(draft,{Zip,Templater}),xml=new Zip(bytes).file('word/document.xml').asText();assert.match(xml,/УЧЕБНЫЙ ДОКУМЕНТ/);assert.match(xml,/Первая строка/);assert.match(xml,/w:br/);assert.match(xml,/&lt;&amp;&gt;/);});
test('custom DOCX interpolates fields without changing original template',()=>{const z=baseTemplate(Zip);z.file('word/document.xml',z.file('word/document.xml').asText().replace('{body}','ЛС {account}; сумма {amount}; пошлина {fee}'));const original=z.generate({type:'uint8array'}),out=new Zip(renderDocx(draft,{Zip,Templater},original)).file('word/document.xml').asText();assert.match(out,/УЧ-001/);assert.match(out,/5.*392,58/);assert.match(out,/2.*000,00/);assert.match(new Zip(original).file('word/document.xml').asText(),/\{account\}/);});
test('unknown fields, macros and external relationships are rejected',()=>{for(const mode of ['unknown','macro','external']){const z=baseTemplate(Zip);if(mode==='unknown')z.file('word/document.xml',z.file('word/document.xml').asText().replace('{body}','{secret}'));if(mode==='macro')z.file('word/vbaProject.bin','bad');if(mode==='external')z.file('word/_rels/document.xml.rels','<Relationship TargetMode="External" Target="https://invalid.example"/>');assert.throws(()=>renderDocx(draft,{Zip,Templater},z.generate({type:'uint8array'})));}assert.ok(templateBytes(Zip).length>100);});
