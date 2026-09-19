import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { chavesAnalytics } from '../src/api/an.js';
const date=new Date('2026-09-15T12:00:00Z');
for(const body of [{evento:'patient_123'}, {evento:'visit',pedido:'123'}, {evento:'visit',paciente_telefone:'5500000000000'}, {evento:'visit',tier:'patient_123'}, {evento:'visit',ciclo:'123'}, {evento:'visit',bruto:{nome:'Paciente'}}, []])assert.equal(chavesAnalytics(body,date),null);
assert.deepEqual(chavesAnalytics({evento:'checkout_iniciado',tier:'essencial',ciclo:'anual'},date),['an:checkout_iniciado:2026-09-15','an:checkout_iniciado:2026-09-15:essencial:anual']);
assert.deepEqual(chavesAnalytics({evento:'ciclo_alterado',ciclo:'mensal'},date),['an:ciclo_alterado:2026-09-15','an:ciclo_alterado:2026-09-15:mensal']);
const writes=[];
let source=fs.readFileSync('src/api/an.js','utf8').replaceAll('export ','');
source=source.replace('default async function handler','async function handler');
const context=vm.createContext({console,Date,process:{env:{}},redisFixture:{incr:async key=>writes.push(['incr',key]),expire:async(key,ttl)=>writes.push(['expire',key,ttl])}});
vm.runInContext(source+'\ngetRedis = async () => redisFixture; this.handler=handler;',context);
async function run(body){let status;await context.handler({method:'POST',body},{setHeader(){},status(code){status=code;return this;},json(){},end(){}});return status;}
assert.equal(await run({evento:'visit',paciente_id:'sensitive'}),400);assert.equal(writes.length,0);
for(const evento of ['ciclo_alterado','checkout_iniciado','checkout_abandonado','briefing_iniciado','briefing_enviado','whatsapp_conectado','reembolso_solicitado'])assert.equal(await run({evento}),204);
assert.equal(writes.length,14);assert.ok(writes.filter(x=>x[0]==='expire').every(x=>x[2]===180*86400));
assert.equal(await run({evento:'checkout_start'}),204);
console.log('PASS: identifier rejection, fixed dimensions, seven events, TTL and legacy compatibility');
