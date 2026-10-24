// ============================================================
// ★★ネットなしで使えるようにする（Service Worker。2026-10-21）
// ============================================================
// ユーザー（10-21）「ペルー旅行の機内（片道18〜21時間・ネットなし）で、こうすけが暗記カードで勉強できるように」。
//   ・★いちばん大事なのは、ネットなしで開けて一人で解けること・記録が残ること
//   ・記録はこれまでどおり localStorage / IndexedDB（ここでは触らない）。送信の待ち行列も今のまま（ネットが戻ったら送る）
//   ・★二人の対戦（trystero）・記録の送信（api.github.com）など、よそのサイトへの通信には一切さわらない
//     （対戦が止まるのがいちばん困るため。よそへの通信はブラウザにそのまま任せる）
//
// 何をどう保存するか
//   ・アプリ本体（index.html・data.js・daimon_data.js・manifest）… 「ネット優先」。
//     つながっていれば毎回新しいものを取り、保存し直す。つながらない（または3.5秒たっても返事が無い）ときだけ保存を出す。
//     → 本体を直したときに build_sw を回し忘れても、ネットがあれば必ず新しい本体が出る
//   ・図（images/）… 「保存優先」。機内用の範囲（第6〜9回の社会・理科とおまけ.ペルー）は最初に全部保存する。
//     ほかの図は、一度見たら保存する。ホームの機内用から「ほかの図も全部保存」もできる
//   ・★版ごとに入れかわる: 下の VERSION（図・機内用の一覧・この sw.js から決まる）が変わると、新しい入れ物を作って、古い入れ物は消す。
//     図は「名前と中身の指紋（hash）」が同じものだけ古い入れ物から写す（同じ図をもう一度ダウンロードしない）。
//     中身が変わった図は新しく取り直す
//
// ★下の「BUILD」の間は tools/build_sw.mjs が書く。手で直さないこと。
//   図（images/）や機内用の範囲の問題を足したら `node tools/build_sw.mjs` を回す
//   （回し忘れは `node tools/build_sw.mjs --check` と verify_data.mjs が鳴らす）
// ==BUILD START==
const VERSION = "7ddd28cff5";
const SHELL = ["index.html","data.js","daimon_data.js","manifest.webmanifest"];
const IMAGES = {"img_01.jpg":"c509d30588","img_02.jpg":"431d673976","img_03.jpg":"20551c26c2","img_04.jpg":"babec171a8","img_05.jpg":"217a902f82","img_06.jpg":"ee339c13be","img_07.jpg":"c1d5fc9bfa","img_08.jpg":"7dc1fc69c9","img_09.jpg":"122f4085cd","img_10.jpg":"79aa27232b","img_11.jpg":"c424068b7d","img_12.jpg":"28f630ce07","img_13.jpg":"3b0f378e3c","img_14.jpg":"fa1c135386","img_15.jpg":"9c58e3530d","img_16.png":"e8243de958","img_17.png":"3c926ffcaf","img_18.png":"d12e058e34","img_19.png":"7b6ca9ce21","img_20.png":"406e674c4e","img_21.png":"0318803303","img_22.png":"6256724412","img_23.jpg":"d2b41ad9fd","img_24.jpg":"9fb82e77d5","img_25.jpg":"e331b1db97","kai1_01.jpg":"9ad30dbb41","kai1_02.jpg":"48cc954516","kai1_03.jpg":"f77c4689f9","kai1_04.jpg":"7be130efb7","kai1_05.jpg":"581087bbec","kai1_06.jpg":"605bb3fc6e","kai1_07.jpg":"443e9c5bb5","kai1_08.jpg":"f933cc3d35","kai1_09.jpg":"61d828179a","kai1_10.jpg":"aeb6fc6a25","kai1_11.jpg":"524c68147c","kai1_12.jpg":"0280a07787","kai1_13.jpg":"347749eafe","kai1_14.jpg":"4189b5e927","kai1_15.jpg":"1de589f164","kai1_17.jpg":"edb1f824fb","kai1_18.jpg":"02deb5baaf","kai1_20.jpg":"78bee7824e","kai1_21.jpg":"b72d254adb","kai1_22.jpg":"9288973c76","kai1_23.jpg":"724d436a13","kai1_24.jpg":"0280a07787","kai1_25.jpg":"8cb1eab9b2","kai1_26.jpg":"e6c693e547","kai1_27.jpg":"4351ddf4cd","kai1_28.jpg":"a94cdbe09e","kai1_29.jpg":"4ee5aed91d","kai1_30.jpg":"9f0cbd69a4","kai1_hikaku.jpg":"1d1a966776","kai2_01.jpg":"036fd88ce8","kai2_02.jpg":"0c18e7d26b","kai2_03.jpg":"18b9306794","kai2_04.jpg":"b8cee663c1","kai2_05.jpg":"9c0f05febe","kai3_01.jpg":"f0c6217e6d","kai3_02.jpg":"3afd2d1f3c","kai3_03.jpg":"5f4dcd0bee","kai3_04.jpg":"001a13ac17","kai3_05.jpg":"7d2c6c91ac","kai3_06.jpg":"c291d6c748","kai3_07.jpg":"84488aff29","kai4_01.jpg":"098f572034","kai5_01.jpg":"3916e558d3","kai5_02.jpg":"9bffc157fb","kai6_01.jpg":"21fc60dbd6","kai6_02.jpg":"99b07705de","kai6_03.jpg":"aabd3bc644","kai6_04.jpg":"aa04ce866e","kai6_05.jpg":"4297d7df87","kai6_06.jpg":"f8a264470b","kai6_07.jpg":"5d19b55330","kai6_08.jpg":"bdda62e4dd","kai6_09.jpg":"e6486ab1d9","kai7_01.jpg":"a289535a32","kai7_02.jpg":"4691df9fea","kai7_03.jpg":"3f76254c1d","kai7_04.jpg":"e497280d98","kai7_05.jpg":"96fdbde7c4","kai7_06.jpg":"c9bfae9ba3","kai7_07.jpg":"e18839816b","kai7_08.jpg":"58e8746c28","kai7_09.jpg":"e825ba55b9","kai8_01.jpg":"21a720c24f","kai8_02.jpg":"2b62307919","kai8_03.jpg":"6a964ed5d7","kai8_04.jpg":"58ec3bec61","kai8_05.jpg":"008e2ea758","kai8_06.jpg":"df368339d4","kai8_07.jpg":"eda4c5b548","kai8_08.jpg":"a6c80cc013","kai8_09.jpg":"10e896648d","kai8_11.jpg":"92b8606831","kai8_13.jpg":"c40d019dce","kai8_14.jpg":"343789076f","kaki_r1_01.jpg":"40efaae693","kaki_r1_02.jpg":"c7c281cf30","kaki_r1_03.jpg":"166ecbf482","kaki_r1_04.jpg":"2669f29305","kaki_r1_05.jpg":"039c4f2ec1","kaki_r1_06.jpg":"c7da6a228f","kaki_r1_07.jpg":"c6ec89a8a8","kaki_r1_08.jpg":"9315802c0c","kaki_r1_map01.jpg":"6c41c6b2ad","kaki_r1_map02.jpg":"ecfac38b14","kaki_r1_map03.jpg":"32bdefa779","kaki_r1_map04.jpg":"8961c1f671","kaki_r1_map05.jpg":"e933b41316","kaki_r1_map06.jpg":"8b0fce1e24","kaki_r1_map07.jpg":"36ea857422","kaki_r1_map08.jpg":"1fb4038761","kaki_r1_map09.jpg":"c8ff2fbc1f","kaki_r1_map10.jpg":"efb44b01e1","kaki_r1_map11.jpg":"11ca22ec54","kaki_r1_map12.jpg":"5cd721c8c7","kaki_r1_map13.jpg":"c6bd4907a1","kaki_r1_map14.jpg":"532a90db1a","kaki_r1_map15.jpg":"1d3a34ebcb","kaki_r2_graph01.jpg":"32d57ce772","kaki_r2_graph02.jpg":"ee3d8ef3f4","kaki_r2_graph03.jpg":"780ea73f9f","kaki_r2_graph04.jpg":"6db370ff43","kaki_r2_graph06.jpg":"4205a357b8","kaki_r2_graph07.jpg":"24abb6e920","kaki_r2_map01.jpg":"e76da5df3c","kaki_r2_map05.jpg":"77871fe1cd","kaki_r2_map07.jpg":"edde3ccd6a","kaki_r2_map08.jpg":"f6b4fd1876","kaki_r2_map09.jpg":"571c10e75a","kaki_r2_map10.jpg":"639fce96a0","kaki_r2_map11.jpg":"f797085a00","kaki_r2_map12.jpg":"e6c57da6a6","kaki_r2_map13.jpg":"a677984d27","kaki_r2_map14.jpg":"453dffc6f7","kaki_r2_map15.jpg":"5584bcee3b","kaki_r2_map16.jpg":"b15ab6d389","kaki_r2_map17.jpg":"5bd38fb762","kaki_r2_map18.jpg":"7d2d88579e","kaki_r2_map19.jpg":"275eabe7ad","kaki_r3_graph01.jpg":"1cd4a32624","kaki_r3_house01.jpg":"b24e489bb0","kaki_r3_map01.jpg":"b5df31df5b","kaki_r3_map02.jpg":"9a95515cd3","kaki_r3_map03.jpg":"8219e31218","kaki_r3_map04.jpg":"d06babe5d0","kaki_r3_map05.jpg":"8d72897ae9","kaki_r3_map06.jpg":"7d5f78fc0a","kaki_r3_map07.jpg":"054c557c2e","kaki_r3_map08.jpg":"5106a9de1f","kaki_r3_map09.jpg":"242f1d237e","kaki_r3_map10.jpg":"fdddf5a535","kaki_r3_map11.jpg":"3b8de18bbf","kaki_r3_map12.jpg":"f3bd73ae35","kaki_r3_map13.jpg":"4d2bcf3271","kaki_r3_map14.jpg":"9502878c46","kaki_r3_map15.jpg":"24ae7e39c1","kaki_r3_map16.jpg":"7702af9f69","kaki_r3_map17.jpg":"c982cc30a8","kaki_r3_map18.jpg":"42988dc4cc","kaki_r3_map19.jpg":"b15c3f5f38","kaki_r3_map20.jpg":"0973448cc4","kaki_r3_map21.jpg":"c90eb11e41","kaki_r3_map22.jpg":"f89a00c568","kaki_r3_map23.jpg":"ce5b967d9c","kaki_r3_map24.jpg":"30c90127f2","kaki_r3_map25.jpg":"f7b333f624","kaki_r3_map26.jpg":"9b79fa55d6","kaki_r3_map27.jpg":"1372731975","kaki_r3_map28.jpg":"f27a725668","kaki_r3_map29.jpg":"f2f731e618","kaki_r3_map30.jpg":"f3cf418799","kaki_r3_map31.jpg":"92342ccf13","kaki_r3_map32.jpg":"aca69cb237","kaki_r3_map33.jpg":"a067100f3f","kaki_r3_map34.jpg":"c09c0eae4c","kaki_r3_map35.jpg":"338b7b8b69","kaki_r3_map36.jpg":"50726b5665","kaki_r3_map37.jpg":"adb3ff0179","kaki_r3_shapes.jpg":"b7ef8fe7b0","kaki_r4_graph01.jpg":"c01de42527","kaki_r4_graph02.jpg":"4df4d97dbb","kaki_r4_map01.jpg":"79964d929e","kaki_r4_map02.jpg":"214032e3fb","kaki_r4_map03.jpg":"d3480426f7","kaki_r4_map04.jpg":"cd15a33476","kaki_r4_map05.jpg":"b9785a5761","kaki_r4_map06.jpg":"0de4ecf793","kaki_r4_map07.jpg":"111c204b6c","kaki_r4_map08.jpg":"a9cd2b7609","kaki_r4_map09.jpg":"53c7a9f0f6","kaki_r4_map10.jpg":"1446aba131","kaki_r4_map11.jpg":"014d34cbfb","kaki_r4_map12.jpg":"1ffc5e7cad","kaki_r4_map13.jpg":"765e7355cb","kaki_r4_map14.jpg":"14832f0c5b","kaki_r4_map15.jpg":"eb779a8f40","kaki_r4_map16.jpg":"efb2dc0c7d","kaki_r4_map17.jpg":"f5d991a0a9","kaki_r4_map18.jpg":"944dce04f2","kaki_r4_map19.jpg":"3573613dda","kaki_r4_map20.jpg":"1051878e40","kaki_r4_map21.jpg":"09de9cc945","kaki_r4_map22.jpg":"7cd6f39783","kaki_r4_map23.jpg":"54f7ae304f","kaki_r4_map24.jpg":"90e43d0b03","kaki_r4_map25.jpg":"25d2998845","kaki_r4_map26.jpg":"b410216caa","kaki_r4_map27.jpg":"01d2acc713","kaki_r4_map28.jpg":"72394df34f","kaki_r4_map29.jpg":"9e710c5386","kaki_r4_map30.jpg":"96dcc908eb","kaki_r4_map31.jpg":"b4b23e5056","kaki_r4_map32.jpg":"c6e141f588","kaki_r4_map33.jpg":"5637d59ea5","kaki_r4_map34.jpg":"da2b9a701d","kaki_r4_map35.jpg":"b38a26a1f9","kaki_r4_map36.jpg":"654a87c9ca","kaki_r4_map37.jpg":"abf9495c0e","kaki_r4_map38.jpg":"d9bfd21599","kaki_r4_map39.jpg":"adc7d0233c","kaki_r4_map40.jpg":"e48b5684b9","kaki_r4_map41.jpg":"a7c900c913","kaki_r4_shapes01.jpg":"fecd868b23","kaki_r4_shapes02.jpg":"d55b458da9","kaki_r5_graph02.jpg":"c66566f25f","kaki_r5_graph05.jpg":"9e47ade2ee","kaki_r5_map01.jpg":"c38804bbfe","kaki_r5_map02.jpg":"7eac88cd41","kaki_r5_map03.jpg":"6cb4d28531","kaki_r5_map04.jpg":"1ce12d046c","kaki_r5_map05.jpg":"ed7badf0e7","kaki_r5_map06.jpg":"cb26648bb7","kaki_r5_map07.jpg":"71e0a7471a","kaki_r5_map08.jpg":"cb201dc1ad","kaki_r5_map09.jpg":"5492cacbbd","kaki_r5_map10.jpg":"55d2435544","kaki_r5_map11.jpg":"343f6ce76d","kaki_r5_map12.jpg":"b74276a461","kaki_r5_map13.jpg":"d662f67d0a","kaki_r5_map14.jpg":"9c25e54a2c","kaki_r5_map15.jpg":"4376961dbe","kaki_r5_map16.jpg":"a398327f58","kaki_r5_map17.jpg":"8f1e23de6f","kaki_r5_map18.jpg":"d063497018","kaki_r5_map19.jpg":"9e149162e9","kaki_r5_map20.jpg":"2c88d5bd5a","kaki_r5_map21.jpg":"1a580e7a32","kaki_r5_map22.jpg":"398b418584","kaki_r5_map23.jpg":"4d62801b55","kaki_r5_map24.jpg":"fe4a91e391","kaki_r5_map25.jpg":"2b1faef03a","kaki_r5_map26.jpg":"caa8517e16","kaki_r5_map27.jpg":"3fc1dacd7c","kaki_r5_map28.jpg":"5b003a47a1","kaki_r5_map29.jpg":"4c177786d9","kaki_r5_map30.jpg":"8771a4c770","kaki_r5_map31.jpg":"8b3232b824","kaki_r5_map32.jpg":"3edcd448a1","kaki_r5_shapes02.jpg":"5df2c79f77","kaki_r5_shapes03.jpg":"aac1488fcf","kaki_r5_table01.jpg":"19533bd2f2","kaki_r5_table02.jpg":"d8019480f5","kaki_r6_graph01.jpg":"96bb4577a7","kaki_r6_map01.jpg":"d9934df143","kaki_r6_map02.jpg":"fe5bd5dbbe","kaki_r6_map03.jpg":"e1e31c6154","kaki_r6_map04.jpg":"b66fa8a761","kaki_r6_map05.jpg":"e32e50186e","kaki_r6_map06.jpg":"edd75b804c","kaki_r6_map07.jpg":"b77ba31786","kaki_r6_map08.jpg":"36b54ed3c8","kaki_r6_map09.jpg":"6f08ed9b1a","kaki_r6_map10.jpg":"5dcc7b61af","kaki_r6_map11.jpg":"8930f6ed5a","kaki_r6_map12.jpg":"b9a01555a7","kaki_r6_map13.jpg":"ae954fc0d3","kaki_r6_map14.jpg":"c3d0ada944","kaki_r6_map15.jpg":"33c3dd2588","kaki_r6_map16.jpg":"f143bac952","kaki_r6_map17.jpg":"8e4028b2f9","kaki_r6_map18.jpg":"e27c8cc933","kaki_r6_map19.jpg":"9675f32dd9","kaki_r6_map20.jpg":"73a10cd200","kaki_r6_map21.jpg":"d4424ac8cf","kaki_r6_map22.jpg":"2274caa4a2","kaki_r6_map23.jpg":"129b3c20cf","kaki_r6_map24.jpg":"334ddece52","kaki_r6_map25.jpg":"6c84324de8","kaki_r6_map26.jpg":"4f02b0d10a","kaki_r6_map27.jpg":"5435b9a073","kaki_r6_map28.jpg":"4f420842a2","kaki_r6_map29.jpg":"43c72ca771","kaki_r6_map30.jpg":"ba92be3494","kaki_r6_map31.jpg":"5fb2f51387","kaki_r6_map32.jpg":"50a9be50e2","kaki_r6_map33.jpg":"ee52bc0e68","kaki_r6_map34.jpg":"c306aca085","kaki_r6_map35.jpg":"82ba643838","kaki_r6_map36.jpg":"f0b2024222","kaki_r6_map37.jpg":"578787fb55","kaki_r6_map38.jpg":"a867948ec2","kaki_r6_map39.jpg":"36ddd230df","kaki_r6_map40.jpg":"b451ce2553","kaki_r6_map41.jpg":"e945ff9e3b","kaki_r6_map42.jpg":"6ead747b59","kaki_r6_map43.jpg":"0c4fa9452c","kaki_r6_map44.jpg":"b6ba24cf61","kaki_r6_map45.jpg":"60c76ded4f","kaki_r6_map46.jpg":"c997423a88","kaki_r6_map47.jpg":"03668f2ff1","kaki_r6_map48.jpg":"b976807139","kaki_r6_map49.jpg":"3bede7dac8","kaki_r6_table01.jpg":"a8958813c8","kaki_r7_graph02.jpg":"1f62812a09","kaki_r7_map01.jpg":"99e641197f","kaki_r7_map02.jpg":"9bf3a0d803","kaki_r7_map03.jpg":"f797eda8eb","kaki_r7_map04.jpg":"decaa1c29a","kaki_r7_map05.jpg":"8c65db6a92","kaki_r7_map06.jpg":"ac9efa31ab","kaki_r7_map07.jpg":"8c1d72ca7c","kaki_r7_map08.jpg":"433be63b7b","kaki_r7_map09.jpg":"54db8c57e6","kaki_r7_map10.jpg":"71c659ba69","kaki_r7_map11.jpg":"b21192fde1","kaki_r7_map12.jpg":"73c261b366","kaki_r7_map13.jpg":"65f35e8544","kaki_r7_map14.jpg":"7177100d76","kaki_r7_map15.jpg":"133fd7c751","kaki_r7_map16.jpg":"3eb4b1ab57","kaki_r7_map17.jpg":"c7e46c62c8","kaki_r7_map18.jpg":"595fa5f1d3","kaki_r7_map19.jpg":"49e0ea66d2","kaki_r7_map20.jpg":"030f5b32b7","kaki_r7_map21.jpg":"05808524f1","kaki_r7_map22.jpg":"bd20c38480","kaki_r7_map23.jpg":"ce6fc43df4","kaki_r7_map24.jpg":"b2753580e2","kaki_r7_map25.jpg":"78bd7107e6","kaki_r7_map26.jpg":"34d4f7151a","kaki_r7_map27.jpg":"b21d7f5dd5","kaki_r7_map28.jpg":"476473eec3","kaki_r7_map29.jpg":"97c7ee7f61","kaki_r7_map30.jpg":"e0005dcc88","kaki_r7_map31.jpg":"204f2de615","kaki_r7_map32.jpg":"f006ba7103","kaki_r7_map33.jpg":"da58f9cff4","kaki_r7_map34.jpg":"1f584b7d6a","kaki_r7_map35.jpg":"11e1004bd8","kaki_r7_map36.jpg":"fd137ff9b8","kaki_r7_table01.jpg":"531ede38c5","kaki_r7_table02.jpg":"0e77123fca","kaki_r8_map01.jpg":"a57f501a98","kaki_r8_map02.jpg":"b06073e9aa","kaki_r8_map03.jpg":"5c8daedeab","kaki_r8_map04.jpg":"10a7bdd03d","kaki_r8_map05.jpg":"4fb5437d44","kaki_r8_map06.jpg":"76a72a9043","kaki_r8_map07.jpg":"77cc3b1bbc","kaki_r8_map08.jpg":"5c8d0a406b","kaki_r8_map09.jpg":"4ab8d8bf9c","kaki_r8_map10.jpg":"005ce58bdc","kaki_r8_map11.jpg":"8c83802060","kaki_r8_map12.jpg":"a5781f5932","kaki_r8_map13.jpg":"f3dcb0128c","kaki_r8_map14.jpg":"40a712cf1f","kaki_r8_map15.jpg":"79a9d6288f","kaki_r8_map16.jpg":"104361951c","kaki_r8_map17.jpg":"e43f6d31b7","kaki_r8_map18.jpg":"c67dd6cb83","kaki_r8_map19.jpg":"48159eea09","kaki_r8_map20.jpg":"023d3f8a9d","kaki_r8_map21.jpg":"03f3be5685","kaki_r8_map22.jpg":"77fe732dea","kaki_r8_map23.jpg":"e005abbe6c","kaki_r8_map24.jpg":"b25880e6c5","kaki_r8_map25.jpg":"7e313cd421","kaki_r8_map26.jpg":"def354dfdd","kaki_r8_map27.jpg":"449858def5","kaki_r8_map28.jpg":"bb9f08441a","kaki_r8_map29.jpg":"472c09aa53","kaki_r8_map30.jpg":"35be560792","kaki_r8_map31.jpg":"6cbd996f24","kaki_r8_map32.jpg":"60af73c7f5","kaki_r8_map33.jpg":"b194bc8ead","kaki_r8_map34.jpg":"cbc7c209db","kaki_r8_map35.jpg":"1de93906c5","kaki_r8_map36.jpg":"6ba8cf6d3b","kaki_r8_map37.jpg":"07aeb406af","kaki_r8_map38.jpg":"bee7eebc38","kaki_r8_map39.jpg":"45f22df6b1","kaki_r8_map40.jpg":"9e3f4196d2","kaki_r8_map41.jpg":"f1ce465720","kaki_r8_map42.jpg":"0551ccd81c","kaki_r8_map43.jpg":"82000f70d1","kaki_r8_map44.jpg":"2b88f0190b","kaki_r8_map45.jpg":"35ee95a764","kaki_r8_map46.jpg":"dd721e219c","kaki_r8_map47.jpg":"a465f218c2","kaki_r8_map48.jpg":"dcdc8a4d37","kaki_r8_map49.jpg":"388b475050","kaki_r8_map50.jpg":"4153c12b69","kaki_r8_map51.jpg":"aa826973da","kaki_r8_map52.jpg":"40fa851678","kaki_r8_map53.jpg":"181212ead1","kaki_r8_map54.jpg":"7c5a4a90c3","kaki_r8_map55.jpg":"488f98a461","kaki_r8_map56.jpg":"95df737037","kaki_r8_map57.jpg":"92d00cfd17","kaki_r8_map58.jpg":"6e49210e3e","r1_01.jpg":"4a6380da93","r1_02.jpg":"da23c3400c","r1_03.jpg":"7eddc7aa20","r1_04.jpg":"dbd948bc4f","r1_05.jpg":"435f86d82f","r1_06.jpg":"f09fdec1b9","r1_shinrin.jpg":"a750740d7f","r2_01.jpg":"3b40218424","r2_02.jpg":"387da36abc","r2_03.jpg":"e1febb3ca4","r2_04.jpg":"95132e77ec","r2_05.jpg":"0b08a836a5","r2_06.jpg":"0213ccc6d0","r2_07.jpg":"87baf0940a","r2_08.jpg":"07e455253d","r2_09.jpg":"42792edd75","r2_10.jpg":"42792edd75","r2_11.jpg":"42792edd75","r2_12.jpg":"4f2c45c956","r2_13.jpg":"4f2c45c956","r2_14.jpg":"4f2c45c956","r2_15.jpg":"52e855ee49","r2_16.jpg":"52e855ee49","r2_17.jpg":"52e855ee49","r2_18.jpg":"440bf4b31f","r2_19.jpg":"440bf4b31f","r2_20.jpg":"535707c4eb","r2_21.jpg":"535707c4eb","r2_22.jpg":"535707c4eb","r2_23.jpg":"535707c4eb","r2_24.jpg":"535707c4eb","r2_25.jpg":"535707c4eb","r2_26.jpg":"2dc94c771d","r2_27.jpg":"2dc94c771d","r2_28.jpg":"2dc94c771d","r2_29.jpg":"2dc94c771d","r2_30.jpg":"a6433ef6c0","r2_31.jpg":"a6433ef6c0","r2_32.jpg":"a6433ef6c0","r2_33.jpg":"a6433ef6c0","r2_34.jpg":"8d16d4ac64","r2_35.jpg":"8d16d4ac64","r2_36.jpg":"8d16d4ac64","r2_37.jpg":"8d16d4ac64","r2_38.jpg":"91f1c5bca5","r2_39.jpg":"b60adbd1c3","r2_40.jpg":"c82ed30fab","r3_chuuwa.jpg":"803f88484e","r3_seishitsu.jpg":"6584946c1b","r3_shijiyaku.jpg":"9b319c7d88","r3_yomi21.jpg":"b2ad009491","r3_yomi24.jpg":"d6fc3d99b8","r3_yomi25.jpg":"aa0903b0ab","r3_yomi27.jpg":"8dc3d4a3a9","r3_yomi36.jpg":"595c040e9f","r3k_1a.jpg":"55441f3d9f","r3k_1b.jpg":"1356de67e3","r3k_2.jpg":"3105353be2","r3k_3.jpg":"4f041ffa22","r3r_3.jpg":"10cadd705b","r3w_2.jpg":"282e87ba1b","r3w_3.jpg":"b2770557c1","r3y_5ans.jpg":"e4645e89b4","r4_01.jpg":"393de5eca5","r4_02.jpg":"40d9b4e0f2","r4_03.jpg":"5b2d21540e","r4_04.jpg":"947f21bcb2","r4k_1.jpg":"90d74e5d01","r4k_2.jpg":"cc3c2e4caa","r4r_1.jpg":"4798d0b4ce","r4r_2.jpg":"7f98882f2f","r4r_3.jpg":"583c14ef86","r4r_4.jpg":"d02ddf1cd0","r4w_1a.jpg":"b6bf2c20dd","r4w_1b.jpg":"64b2ae8256","r4w_2.jpg":"ba6aa9c69c","r4w_3.jpg":"b838901256","r5u13_01.jpg":"8a69c689ae","r5u13_02.jpg":"e52d50ee0d","r5u13_03.jpg":"8b6aae14a3","r5u13_04.jpg":"c0812ddc66","r5u13_05.jpg":"a2ffcc22da","r5u13_06.jpg":"41b8282bc6","r5u13_07.jpg":"a42085c269","r5u13_08.jpg":"7ff9dfa5c5","r6_01.jpg":"32ff3016d8","r6_02.jpg":"3c73527dd8","r6_03.jpg":"a444385107","r6_04.jpg":"a4dfdac612","r6_05.jpg":"b5f6b9f6a3","r6_06.jpg":"1a7c249e0f","r6_07.jpg":"389ba3d7b8","r6_08.jpg":"54e693e4b7","r6_09.jpg":"b02381d63b","r6_10.jpg":"da46bca31a","r6_11.jpg":"9259db1350","r6_12.jpg":"14c449020d","r6_13.jpg":"0577c1be67","r6_14.jpg":"79530fa540","r6_15.jpg":"dcf990eb89","r6_16.jpg":"d5a37d0bce","r6_17.jpg":"cbeac19169","r6k_1.jpg":"0c5793f6c1","r6k_2.jpg":"7cc5f04102","r6k_2b.jpg":"19f68c1767","r6k_3.jpg":"6b57f40878","r6k_4.jpg":"6eba853e20","r6p_01.jpg":"e16dfbac90","r6p_02.jpg":"9a335bea93","r6p_03.jpg":"9ed60c3d70","r6p_04.jpg":"ae5944a085","r6p_05.jpg":"b6a1836a78","r6p_06.jpg":"acb7478bd6","r6p_07.jpg":"a4c8c8dd0d","r6r_1.jpg":"4606457fc7","r6r_1b.jpg":"dafd16e516","r6r_2.jpg":"73bd9e9cc4","r6r_2b.jpg":"ce235b797a","r6r_2c.jpg":"3638d4d780","r6r_3.jpg":"8bc4c35ba9","r6r_3ans.jpg":"c729ca8dc1","r6r_4.jpg":"1a97fe9f9a","r6r_4b.jpg":"e1f0d07003","r6r_4c.jpg":"606d8620bb","r6r_5.jpg":"83747b014d","r7_01.jpg":"466ea22251","r7_02.jpg":"84ef6e008b","r7_03.jpg":"3583685d2a","r7_04.jpg":"a49dfe47bb","r7_05.jpg":"8357813f22","r7_06.jpg":"1e30160b9f","r7_07.jpg":"fec15a5ddd","r7_08.jpg":"5f8a1be38a","r7_10.jpg":"01bd20bac0","r7k_2.jpg":"c3e5b1fdc4","r7k_2b.jpg":"b4937893d8","r7k_3.jpg":"dfb199cdc1","r7k_4.jpg":"46545faf0d","r7r_1.jpg":"6de7fd0a8e","r7r_1b.jpg":"ed991d90d3","r7r_1c.jpg":"235b1d340f","r7r_2.jpg":"807cc07178","r7r_3.jpg":"9541daa1d1","r7r_5c.jpg":"bad6e5885d","r7y_1.jpg":"c647deffec","r8_05.jpg":"997a3b7635","r8_06.jpg":"b56d871128","r8_07.jpg":"5bb801877e","r8_10.jpg":"ac484d0958","r8_11.jpg":"174c916ad6","r8_12.jpg":"3e8313d3ab","r8_13.jpg":"f2f5f12b44","r8_14.jpg":"de0761c890","r8_15.jpg":"955040e2d6","r8_16.jpg":"17e5a0bb41","r8_17.jpg":"fe5825e0da","r8_18.jpg":"5ad51c980d","r8k_1.jpg":"a7e3225a1e","r8k_2.jpg":"2d8935c26a","r8k_3.jpg":"fea0c57403","r8k_4.jpg":"101c437443","r8r_1.jpg":"781eb27ca1","r8r_1b.jpg":"b123b7d86d","r8r_1c.jpg":"eb02922d34","r8r_2.jpg":"eb632645d4","r8r_2c.jpg":"d7e9c8d38d","r8r_3.jpg":"fb200207c9","r8r_4.jpg":"cf5f75eccf","r8r_5.jpg":"4876ee8eeb","r8r_5b.jpg":"7799e66960","r8r_5c.jpg":"6bd6e2bad1","r8y_1.jpg":"5a55076e7d","r8y_2.jpg":"ef35951bec","r8y_3.jpg":"b95a28fa6d","r9_01.jpg":"ef3eeb19d5","r9_02.jpg":"75ffd6c347","r9_03.jpg":"e6ae1b2a1c","r9_04.jpg":"ae3ca3e752","r9_05.jpg":"d037fd4536","r9_06.jpg":"4837b59107","r9_07.jpg":"3b27c8bb15","r9_08.jpg":"d8f45dbe17","r9_09.jpg":"597d1b0423","r9d_01.jpg":"db4cc4c881","r9k_1.jpg":"560bbb6301","r9k_1b.jpg":"62cbe10e38","r9k_2.jpg":"b7467838ca","r9k_3.jpg":"8716d534ac","r9r_1.jpg":"6856a4e449","r9r_1b.jpg":"5cebd6dd8f","r9r_3.jpg":"f199288e40","r9r_4.jpg":"d91ea6189f","r9r_4b.jpg":"68486a883e","r9r_5.jpg":"e5553f71d3","組分け6_1_地図.png":"ec7b795c88","組分け6_1_絵.png":"56dddd3c07","組分け6_3_地図.png":"6488459456","組分け6_3_模式図.png":"5b845a6430"};
const KINAI_IMAGES = ["kai6_01.jpg","kai6_03.jpg","kai6_04.jpg","kai6_05.jpg","kai6_06.jpg","kai6_07.jpg","kai6_08.jpg","kai6_09.jpg","kai7_01.jpg","kai7_02.jpg","kai7_03.jpg","kai7_04.jpg","kai7_05.jpg","kai7_06.jpg","kai7_07.jpg","kai7_08.jpg","kai7_09.jpg","kai8_01.jpg","kai8_02.jpg","kai8_03.jpg","kai8_04.jpg","kai8_05.jpg","kai8_06.jpg","kai8_07.jpg","kai8_08.jpg","kai8_09.jpg","kai8_11.jpg","kai8_13.jpg","kai8_14.jpg","r6_01.jpg","r6_02.jpg","r6_03.jpg","r6_04.jpg","r6_06.jpg","r6_07.jpg","r6_08.jpg","r6_09.jpg","r6_10.jpg","r6_11.jpg","r6_12.jpg","r6_13.jpg","r6_14.jpg","r6_15.jpg","r6_16.jpg","r6_17.jpg","r6k_1.jpg","r6k_2.jpg","r6k_2b.jpg","r6k_3.jpg","r6k_4.jpg","r6p_01.jpg","r6p_02.jpg","r6p_03.jpg","r6p_04.jpg","r6p_05.jpg","r6p_06.jpg","r6p_07.jpg","r6r_2.jpg","r6r_2b.jpg","r6r_2c.jpg","r6r_4.jpg","r6r_4b.jpg","r6r_4c.jpg","r7_01.jpg","r7_02.jpg","r7_03.jpg","r7_04.jpg","r7_05.jpg","r7_07.jpg","r7_08.jpg","r7_10.jpg","r7k_2.jpg","r7k_2b.jpg","r7k_3.jpg","r7k_4.jpg","r7r_1.jpg","r7r_1b.jpg","r7r_1c.jpg","r7r_2.jpg","r7r_3.jpg","r7y_1.jpg","r8_05.jpg","r8_06.jpg","r8_07.jpg","r8_10.jpg","r8_11.jpg","r8_12.jpg","r8_13.jpg","r8_16.jpg","r8_17.jpg","r8k_1.jpg","r8k_2.jpg","r8k_3.jpg","r8k_4.jpg","r8r_1.jpg","r8r_1b.jpg","r8r_1c.jpg","r8r_2.jpg","r8r_2c.jpg","r8r_3.jpg","r8r_4.jpg","r8r_5.jpg","r8y_1.jpg","r8y_2.jpg","r8y_3.jpg","r9_01.jpg","r9_02.jpg","r9_03.jpg","r9_04.jpg","r9_05.jpg","r9_06.jpg","r9_07.jpg","r9_08.jpg","r9_09.jpg","r9k_1.jpg","r9k_1b.jpg","r9k_2.jpg","r9k_3.jpg","r9r_1.jpg","r9r_1b.jpg","r9r_3.jpg","r9r_4.jpg"];
// ==BUILD END==

const SHELL_CACHE = "kq-shell-" + VERSION;
const IMG_CACHE = "kq-img-" + VERSION;
const NET_TIMEOUT_MS = 3500;

const BASE = new URL("./", self.location).href;   // 例 https://nambanamba.github.io/kosukequiz-battle/
const imgKey = name => BASE + "images/" + encodeURI(name) + (IMAGES[name] ? "?v=" + IMAGES[name] : "");

// 古い入れ物から、同じ鍵（＝同じ名前・同じ指紋）のものを写す。無ければ null
async function fromOldCaches(key, prefix){
  const names = (await caches.keys()).filter(n => n.startsWith(prefix) && n !== IMG_CACHE && n !== SHELL_CACHE);
  for(const n of names){
    const r = await (await caches.open(n)).match(key);
    if(r) return r;
  }
  return null;
}
async function fetchOk(url){
  const r = await fetch(url, { cache: "no-store" });
  if(!r.ok) throw new Error(url + " " + r.status);
  return r;
}
// 図を1枚、今の入れ物に入れる（もう入っていれば何もしない）
async function putImage(cache, name){
  const key = imgKey(name);
  if(await cache.match(key)) return "have";
  const old = await fromOldCaches(key, "kq-img-");
  if(old){ await cache.put(key, old); return "copied"; }
  await cache.put(key, await fetchOk(key));
  return "fetched";
}
async function runPool(list, n, fn){
  let i = 0;
  const work = async () => { while(i < list.length){ const x = list[i++]; await fn(x); } };
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, work));
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL_CACHE);
    // 本体: 新しく取る（ここが取れなければ入れかえない＝古い版のまま動く）
    for(const f of SHELL){
      await shell.put(BASE + f, await fetchOk(BASE + f));
    }
    // 開くときの「./」も index.html と同じもの
    if(SHELL.includes("index.html")) await shell.put(BASE, (await shell.match(BASE + "index.html")).clone());
    const img = await caches.open(IMG_CACHE);
    // 機内用の図は全部（取れなければ入れかえない）
    await runPool(KINAI_IMAGES, 6, name => putImage(img, name));
    // 前の版で保存していたほかの図も、指紋が同じなら写す（ダウンロードはしない）
    const olds = (await caches.keys()).filter(n => n.startsWith("kq-img-") && n !== IMG_CACHE);
    for(const n of olds){
      const c = await caches.open(n);
      for(const req of await c.keys()){
        const u = new URL(req.url);
        const name = decodeURI(u.pathname.slice(new URL(BASE).pathname.length + "images/".length));
        if(IMAGES[name] && u.searchParams.get("v") === IMAGES[name] && !(await img.match(req))){
          await img.put(req, await c.match(req));
        }
      }
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for(const n of await caches.keys()){
      if((n.startsWith("kq-shell-") || n.startsWith("kq-img-")) && n !== SHELL_CACHE && n !== IMG_CACHE) await caches.delete(n);
    }
    await self.clients.claim();
  })());
});

// 本体: ネット優先（時間切れで保存を出す。あとから届いた新しいものは保存し直す）
function shellFetch(event, file){
  return (async () => {
    const cache = await caches.open(SHELL_CACHE);
    const key = file === "" ? BASE : BASE + file;
    const net = fetch(event.request)
      .then(async r => {
        if(r && r.ok && r.type === "basic"){ await cache.put(key, r.clone()); if(file === "index.html") await cache.put(BASE, r.clone()); if(file === "") await cache.put(BASE + "index.html", r.clone()); }
        return r;
      });
    event.waitUntil(net.catch(() => {}));
    let timer;
    const timeout = new Promise(res => { timer = setTimeout(() => res(null), NET_TIMEOUT_MS); });
    try{
      const r = await Promise.race([net, timeout]);
      clearTimeout(timer);
      if(r && r.ok) return r;
    }catch(e){ clearTimeout(timer); }
    const saved = await cache.match(key) || await cache.match(BASE + "index.html");
    if(saved) return saved;
    return net;   // 保存も無い: ネットの結果をそのまま（失敗ならブラウザのいつもの画面）
  })();
}

// 図: 保存優先。無ければ取って保存
function imageFetch(event, name){
  return (async () => {
    const cache = await caches.open(IMG_CACHE);
    const key = imgKey(name);
    const hit = await cache.match(key);
    if(hit) return hit;
    try{
      const r = await fetch(key);
      if(r.ok && r.type === "basic") event.waitUntil(cache.put(key, r.clone()));
      return r;
    }catch(e){
      return new Response("", { status: 504, statusText: "offline" });
    }
  })();
}

self.addEventListener("fetch", event => {
  const req = event.request;
  if(req.method !== "GET") return;
  const url = new URL(req.url);
  // ★よそのサイト（trystero・api.github.com など）には、さわらない
  if(!url.href.startsWith(BASE)) return;
  const rel = decodeURI(url.pathname.slice(new URL(BASE).pathname.length));
  if(req.mode === "navigate" || rel === "" || rel === "index.html") return event.respondWith(shellFetch(event, rel === "" ? "" : "index.html"));
  if(SHELL.includes(rel)) return event.respondWith(shellFetch(event, rel));
  if(rel.startsWith("images/")) return event.respondWith(imageFetch(event, rel.slice("images/".length)));
  // それ以外（sw.js など）は、いつもどおり
});

// ホームの「機内用」から: 保存のようす／ほかの図も全部保存
self.addEventListener("message", event => {
  const port = event.ports && event.ports[0];
  const msg = event.data || {};
  const reply = o => { try{ port ? port.postMessage(o) : event.source && event.source.postMessage(o); }catch(e){} };
  if(msg.type === "status"){
    event.waitUntil((async () => {
      const img = await caches.open(IMG_CACHE), shell = await caches.open(SHELL_CACHE);
      let kinai = 0, all = 0, shellHave = 0;
      for(const n of KINAI_IMAGES) if(await img.match(imgKey(n))) kinai++;
      const names = Object.keys(IMAGES);
      for(const n of names) if(await img.match(imgKey(n))) all++;
      for(const f of SHELL) if(await shell.match(BASE + f)) shellHave++;
      reply({ type: "status", version: VERSION, shell: shellHave, shellTotal: SHELL.length,
        kinai: kinai, kinaiTotal: KINAI_IMAGES.length, all: all, allTotal: names.length });
    })());
  }else if(msg.type === "cacheAll"){
    event.waitUntil((async () => {
      const img = await caches.open(IMG_CACHE);
      const names = Object.keys(IMAGES);
      let done = 0, fail = 0;
      await runPool(names, 4, async n => {
        try{ await putImage(img, n); }catch(e){ fail++; }
        done++;
        if(done % 20 === 0 || done === names.length) reply({ type: "progress", done: done, total: names.length, fail: fail });
      });
      reply({ type: "cacheAllDone", done: done, total: names.length, fail: fail });
    })());
  }
});
