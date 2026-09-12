// 端末の「戻る」で、ひとり練習／対戦が確認なしに落ちないかを実機で確かめる。
// ★キャンセル後に積み直せているか（次の戻るでも確認が出るか）まで見る。
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { pathToFileURL } from "node:url"; import { execSync } from "node:child_process";
const ROOT=path.resolve(process.cwd());
const g=execSync("npm root -g",{encoding:"utf8"}).trim();
const {chromium}=await import(pathToFileURL(path.join(g,"playwright","index.mjs")).href);
const M={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".jpg":"image/jpeg",".png":"image/png"};
const s=http.createServer((q,r)=>{const f=path.join(ROOT,decodeURIComponent(q.url.split("?")[0]).replace(/^\/+/,"")||"index.html");
 fs.readFile(f,(e,b)=>e?r.writeHead(404).end():(r.writeHead(200,{"content-type":M[path.extname(f).toLowerCase()]||"application/octet-stream"}),r.end(b)));});
await new Promise(r=>s.listen(0,"127.0.0.1",r));
const B="http://127.0.0.1:"+s.address().port+"/index.html";
const br=await chromium.launch({channel:"chrome"});
const ctx=await br.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
const p=await ctx.newPage();
const dialogs=[]; let answer=false;
p.on("dialog", async d=>{ dialogs.push(d.message()); answer ? await d.accept() : await d.dismiss(); });
await p.goto(B); await p.waitForTimeout(900);
await p.evaluate(()=>localStorage.clear()); await p.reload(); await p.waitForTimeout(900);
const screen=()=>p.evaluate(()=>{const e=[...document.querySelectorAll(".screen")].find(x=>getComputedStyle(x).display!=="none");return e?e.id:"?";});
// ひとり練習を始めて1問答える（quizResults を1件にする）
await p.click("#solo-start-btn"); await p.waitForTimeout(700);
await p.click("#solo-reveal-btn"); await p.waitForTimeout(150);
await p.click("#solo-judge-ok"); await p.waitForTimeout(300);
const out={ "出題中の画面": await screen(),
            "履歴の長さ": await p.evaluate(()=>history.length) };
// ① 戻る → 確認が出て、キャンセルすると練習に残るか
answer=false; dialogs.length=0;
await p.goBack().catch(()=>{}); await p.waitForTimeout(600);
out["①戻る: 確認が出た"]=dialogs.length>0;
out["①の文言"]=dialogs[0]||"（出なかった）";
out["①キャンセル後の画面"]=await screen();
// ★積み直しができているかを直接見る。confirm が出るかだけでは足りない
//   （テスト環境に余分な履歴があると、積み直さなくても確認が出てしまう）
out["★①キャンセル後に番が積まれているか"]=await p.evaluate(()=>!!(history.state&&history.state.kqGuard));
// ② ★もう一度戻る → また確認が出るか（積み直しができているか）
dialogs.length=0;
await p.goBack().catch(()=>{}); await p.waitForTimeout(600);
out["②もう一度戻る: また確認が出た"]=dialogs.length>0;
out["②キャンセル後の画面"]=await screen();
out["★②キャンセル後に番が積まれているか"]=await p.evaluate(()=>!!(history.state&&history.state.kqGuard));
// ③ 3回目は OK して、ホームに戻るか
answer=true; dialogs.length=0;
await p.goBack().catch(()=>{}); await p.waitForTimeout(700);
out["③OKした後の画面"]=await screen();
// ★対戦画面（screen-battle）はここでは確認できない。
//   部屋を作って「二人で始める」には2台目の接続が必要で、ヘッドレスでは到達できない
//   （作業メモ 2026-09-08「機械では確認できなかった2台目をつないだ実際の対戦」と同じ事情）。
//   ★popstate の処理は1つで、対戦もひとり練習も同じ経路を通る。分かれているのは
//   確認の文言と後片づけ（leaveRoom）だけ。**対戦側は実機2台で見てもらう必要がある。**
out["対戦側の確認"]="★ここでは未検証（2台目の接続が必要）。実機で要確認";
console.log(JSON.stringify(out,null,1));
await br.close(); s.close();
