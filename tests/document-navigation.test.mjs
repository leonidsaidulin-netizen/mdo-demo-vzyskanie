import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('case documents are opened per case, not created from the selection bar',()=>{
 const app=readFileSync(new URL('../dist/app.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(app,/data-batch-document|saveDocumentBatch|data-case-notify/);
 assert.match(app,/data-case-work="documents"/);
 assert.match(app,/data-action="chooseChannel"/);
 const workbench=readFileSync(new URL('../dist/workbench.mjs',import.meta.url),'utf8');
 assert.match(workbench,/Ещё не сформирован/);
 assert.match(workbench,/Открыть Word/);
});
