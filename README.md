# 오늘의 진짜 정보판 (T04)

대전 현재 기온(Open-Meteo, API 키 없음)을 하루 1건 기록하고 직전 날짜와 비교합니다.
외부 호출이 실패해도 마지막 정상값을 지우지 않고 `stale + error_code`로 표시합니다.
합성 재생은 공식 공개 fixture 9종(contract 1.1.0)을 원문 그대로 씁니다(`api/_fixtures.js`).

## 저장소 루트 구조 (이 구조 그대로 GitHub 맨 위에)
index.html · package.json · vercel.json · api/{board.js, refresh.js, _lib.js, _fixtures.js}

## 배포 (Vercel)
1. GitHub에 올리고 Vercel에서 Import.
2. Storage/Marketplace → **Upstash Redis** 연결 (환경변수 자동 주입). 연결하지 않으면 서버 재시작 때 기록이 사라집니다.
3. 서로 다른 KST 날짜 2일 이상 접속/수집 (cron: 매일 12:00 KST).
4. 시크릿 창에서 접속해 확인. `주소/api/board`가 JSON을 돌려주면 API 정상.

비밀키 없음: 코드·저장소·네트워크 어디에도 키가 없습니다.
