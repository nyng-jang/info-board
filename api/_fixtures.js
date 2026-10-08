// 공식 T04 공개 fixture 9종 (contract 1.1.0) 원문 그대로 — 수정 금지
export default [
  {
    "fixture_id": "T04-NORMAL-D1-A",
    "contract_version": "1.1.0",
    "description_ko": "가상 1일차 첫 정상 조회: 새 일별 행을 만든다.",
    "virtual_now": "2026-08-24T00:00:00.000Z",
    "transport": {
      "mode": "http",
      "status": 200,
      "delay_ms": 20,
      "deadline_ms": 1500,
      "headers": {
        "content-type": "application/json"
      }
    },
    "payload": {
      "signal_id": "aleph-demo-index",
      "normalized_value": 100,
      "unit": "pt",
      "source_name": "ALEPH 결정론 replay",
      "source_url": "https://fixtures.aleph.invalid/t04/demo-index",
      "source_time": "2026-08-23T23:59:00.000Z",
      "fetched_at": "2026-08-24T00:00:00.000Z",
      "record_timezone": "Asia/Seoul",
      "record_date": "2026-08-24"
    },
    "expected": {
      "freshness": "fresh",
      "error_code": "none",
      "row_count": 1,
      "stored_value": 100,
      "delta": null,
      "preserve_last_good": true,
      "record_date": "2026-08-24"
    }
  },
  {
    "fixture_id": "T04-NORMAL-D1-B",
    "contract_version": "1.1.0",
    "description_ko": "가상 1일차 두 번째 정상 조회: 새 행 없이 같은 행을 갱신한다.",
    "virtual_now": "2026-08-24T09:00:00.000Z",
    "transport": {
      "mode": "http",
      "status": 200,
      "delay_ms": 20,
      "deadline_ms": 1500,
      "headers": {
        "content-type": "application/json"
      }
    },
    "payload": {
      "signal_id": "aleph-demo-index",
      "normalized_value": 105,
      "unit": "pt",
      "source_name": "ALEPH 결정론 replay",
      "source_url": "https://fixtures.aleph.invalid/t04/demo-index",
      "source_time": null,
      "fetched_at": "2026-08-24T09:00:00.000Z",
      "record_timezone": "Asia/Seoul",
      "record_date": "2026-08-24"
    },
    "expected": {
      "freshness": "fresh",
      "error_code": "none",
      "row_count": 1,
      "stored_value": 105,
      "delta": null,
      "preserve_last_good": true,
      "same_record_id_as": "T04-NORMAL-D1-A",
      "record_date": "2026-08-24"
    }
  },
  {
    "fixture_id": "T04-NORMAL-D2",
    "contract_version": "1.1.0",
    "description_ko": "가상 2일차 정상 조회: 새 행과 전일 대비 +15를 만든다.",
    "virtual_now": "2026-08-25T00:00:00.000Z",
    "transport": {
      "mode": "http",
      "status": 200,
      "delay_ms": 20,
      "deadline_ms": 1500,
      "headers": {
        "content-type": "application/json"
      }
    },
    "payload": {
      "signal_id": "aleph-demo-index",
      "normalized_value": 120,
      "unit": "pt",
      "source_name": "ALEPH 결정론 replay",
      "source_url": "https://fixtures.aleph.invalid/t04/demo-index",
      "source_time": "2026-08-24T23:59:00.000Z",
      "fetched_at": "2026-08-25T00:00:00.000Z",
      "record_timezone": "Asia/Seoul",
      "record_date": "2026-08-25"
    },
    "expected": {
      "freshness": "fresh",
      "error_code": "none",
      "row_count": 2,
      "stored_value": 120,
      "delta": 15,
      "preserve_last_good": true,
      "record_date": "2026-08-25"
    }
  },
  {
    "fixture_id": "T04-TIMEOUT",
    "contract_version": "1.1.0",
    "description_ko": "제한시간보다 늦은 응답: 마지막 정상값을 보존하고 timeout을 기록한다.",
    "virtual_now": "2026-08-24T10:00:00.000Z",
    "transport": {
      "mode": "timeout",
      "status": null,
      "delay_ms": 5000,
      "deadline_ms": 1500,
      "headers": {}
    },
    "payload": null,
    "expected": {
      "freshness": "stale",
      "error_code": "timeout",
      "row_count": 1,
      "stored_value": 105,
      "delta": null,
      "preserve_last_good": true
    }
  },
  {
    "fixture_id": "T04-AUTH-401",
    "contract_version": "1.1.0",
    "description_ko": "외부 출처가 인증을 거절한 응답: auth를 기록한다.",
    "virtual_now": "2026-08-24T10:01:00.000Z",
    "transport": {
      "mode": "http",
      "status": 401,
      "delay_ms": 20,
      "deadline_ms": 1500,
      "headers": {
        "content-type": "application/json"
      }
    },
    "payload": {
      "message": "unauthorized synthetic fixture"
    },
    "expected": {
      "freshness": "stale",
      "error_code": "auth",
      "row_count": 1,
      "stored_value": 105,
      "delta": null,
      "preserve_last_good": true
    }
  },
  {
    "fixture_id": "T04-RATE-429",
    "contract_version": "1.1.0",
    "description_ko": "외부 출처의 호출 제한 응답: rate_limit과 Retry-After 관측값을 기록한다.",
    "virtual_now": "2026-08-24T10:02:00.000Z",
    "transport": {
      "mode": "http",
      "status": 429,
      "delay_ms": 20,
      "deadline_ms": 1500,
      "headers": {
        "content-type": "application/json",
        "retry-after": "60"
      }
    },
    "payload": {
      "message": "rate limited synthetic fixture"
    },
    "expected": {
      "freshness": "stale",
      "error_code": "rate_limit",
      "row_count": 1,
      "stored_value": 105,
      "delta": null,
      "preserve_last_good": true
    }
  },
  {
    "fixture_id": "T04-OFFLINE",
    "contract_version": "1.1.0",
    "description_ko": "네트워크 연결 중단: 마지막 정상값을 보존하고 offline을 기록한다.",
    "virtual_now": "2026-08-24T10:03:00.000Z",
    "transport": {
      "mode": "offline",
      "status": null,
      "delay_ms": 0,
      "deadline_ms": 1500,
      "headers": {}
    },
    "payload": null,
    "expected": {
      "freshness": "stale",
      "error_code": "offline",
      "row_count": 1,
      "stored_value": 105,
      "delta": null,
      "preserve_last_good": true
    }
  },
  {
    "fixture_id": "T04-SCHEMA-BREAK",
    "contract_version": "1.1.0",
    "description_ko": "HTTP 성공이지만 필수값 타입이 바뀐 응답: schema_error를 기록한다.",
    "virtual_now": "2026-08-24T10:04:00.000Z",
    "transport": {
      "mode": "http",
      "status": 200,
      "delay_ms": 20,
      "deadline_ms": 1500,
      "headers": {
        "content-type": "application/json"
      }
    },
    "payload": {
      "signal_id": "aleph-demo-index",
      "normalized_value": "105",
      "unit": "pt",
      "source_name": "ALEPH 결정론 replay",
      "source_url": "https://fixtures.aleph.invalid/t04/demo-index",
      "source_time": null,
      "fetched_at": "2026-08-24T10:04:00.000Z",
      "record_timezone": "Asia/Seoul",
      "record_date": "2026-08-24"
    },
    "expected": {
      "freshness": "stale",
      "error_code": "schema_error",
      "row_count": 1,
      "stored_value": 105,
      "delta": null,
      "preserve_last_good": true
    }
  },
  {
    "fixture_id": "T04-RECOVER-D2",
    "contract_version": "1.1.0",
    "description_ko": "오류 뒤 가상 2일차 재시도 성공: fresh/none으로 회복하고 전일 대비 +15를 만든다.",
    "virtual_now": "2026-08-25T00:00:00.000Z",
    "transport": {
      "mode": "http",
      "status": 200,
      "delay_ms": 20,
      "deadline_ms": 1500,
      "headers": {
        "content-type": "application/json"
      }
    },
    "payload": {
      "signal_id": "aleph-demo-index",
      "normalized_value": 120,
      "unit": "pt",
      "source_name": "ALEPH 결정론 replay",
      "source_url": "https://fixtures.aleph.invalid/t04/demo-index",
      "source_time": "2026-08-24T23:59:00.000Z",
      "fetched_at": "2026-08-25T00:00:00.000Z",
      "record_timezone": "Asia/Seoul",
      "record_date": "2026-08-25"
    },
    "expected": {
      "freshness": "fresh",
      "error_code": "none",
      "row_count": 2,
      "stored_value": 120,
      "delta": 15,
      "preserve_last_good": true,
      "record_date": "2026-08-25"
    }
  }
];
