export interface WeatherData {
    tmp: number; // 기온 (섭씨)
    pty: number; // 강수형태 (0:없음, 1:비, 2:비/눈, 3:눈, 4:소나기)
    pop: number; // 강수확률 (%)
    wsd: number; // 풍속 (m/s)
    reh: number; // 습도 (%)
  }
  
  export interface ScoreResult {
    score: number;
    grade: 'BEST' | 'GOOD' | 'SOSO' | 'BAD' | 'WORST'; // 프론트 색상용 등급
    mainComment: string;
    recommendation: string;
    feelsLike: number;
    riskFactors: string[]; // 위험 요인 (UI에서 빨간색 강조용)
  }
  
  // --------------------------------------------------------------------------
  // 1. 체감온도 산출 (계절별 알고리즘 분기)
  // --------------------------------------------------------------------------
  
  // (A) 겨울: Wind Chill (JAG/TI 모델) - 유효범위: 10도 이하, 풍속 1.3m/s 이상
  function calculateWindChill(temp: number, windMs: number): number {
    if (temp > 10 || windMs < 1.3) return temp;
    const windKmh = windMs * 3.6;
    return 13.12 + 0.6215 * temp - 11.37 * Math.pow(windKmh, 0.16) + 0.3965 * temp * Math.pow(windKmh, 0.16);
  }
  
  // (B) 여름: Heat Index (Steadman 모델 근사치 -> 섭씨 변환)
  // 유효범위: 20도 이상 (습도가 낮으면 기온보다 낮게 나올 수도 있음)
  function calculateHeatIndex(temp: number, humid: number): number {
    if (temp < 20) return temp;
    
    // 간단한 섭씨 HI 근사식 (HI = T + 0.555 * (e - 10))
    // e = 6.11 * exp(5417.7530 * (1/273.16 - 1/(273.15 + T))) * (humid/100)
    // 러닝용으로는 Dew Point 기반의 간단한 가중치가 더 직관적일 수 있으나,
    // 표준적인 Heat Index 공식을 사용하여 신뢰도 확보.
    
    const c1 = -8.78469475556;
    const c2 = 1.61139411;
    const c3 = 2.33854883889;
    const c4 = -0.14611605;
    const c5 = -0.012308094;
    const c6 = -0.0164248277778;
    const c7 = 0.002211732;
    const c8 = 0.00072546;
    const c9 = -0.000003582;
  
    // HI 계산은 보통 화씨로 하므로 변환 과정 필요
    const T = temp;
    const R = humid;
    
    // Rothfusz regression (단순화된 버전보다 이게 정확함)
    // 여기선 복잡도를 줄이기 위해 러너들이 많이 쓰는 "습구흑구온도(WBGT)" 느낌의 간이 보정 사용
    // T + (습도 가중치)
    
    // Dew Point(이슬점) 근사 계산
    const b = 17.625;
    const c = 243.04;
    const gamma = (b * T) / (c + T) + Math.log(R / 100);
    const dewPoint = (c * gamma) / (b - gamma);
  
    // 러닝 관점: 기온 + (이슬점 - 14)*0.8 정도가 체감 부하와 비슷
    // 이슬점이 24도면 매우 힘듦.
    let feelsLike = T;
    if (dewPoint > 14) {
        feelsLike += (dewPoint - 14) * 0.8;
    }
    
    return feelsLike;
  }
  
  function getUnifiedFeelsLike(temp: number, wind: number, humid: number): number {
      if (temp <= 10) return calculateWindChill(temp, wind);
      if (temp >= 20) return calculateHeatIndex(temp, humid);
      return temp; // 10~20도 사이는 그냥 기온 사용
  }
  
  
  // --------------------------------------------------------------------------
  // 2. 점수 계산 (V2 Logic)
  // --------------------------------------------------------------------------
  export function calculateRunningScore(weather: WeatherData): ScoreResult {
    const { tmp, pty, pop, wsd, reh } = weather;
    
    // 1. 체감온도 통합 계산
    const feelsLike = getUnifiedFeelsLike(tmp, wsd, reh);
    const feelsLikeInt = Math.round(feelsLike);
  
    let score = 100;
    const riskFactors: string[] = [];
  
    // ------------------------------------
    // [Loss Function] Temperature Penalty
    // 최적온도(T_opt): 10도
    // ------------------------------------
    const T_OPT = 10;
    
    if (feelsLike < T_OPT) {
        // 추위 감점: (10 - T)^1.6 * 0.35
        // 예: 0도 -> 10^1.6(39) * 0.35 ≈ -13점 (87점)
        // 예: -10도 -> 20^1.6(120) * 0.35 ≈ -42점 (58점) -> 합당함
        const diff = T_OPT - feelsLike;
        score -= 0.35 * Math.pow(diff, 1.6);
    } else {
        // 더위 감점: (T - 10)^1.5 * 0.5
        // 예: 20도 -> 10^1.5(31) * 0.5 ≈ -15점 (85점)
        // 예: 25도 -> 15^1.5(58) * 0.5 ≈ -29점 (71점)
        // 예: 30도 -> 20^1.5(89) * 0.5 ≈ -44점 (56점) -> 더위에 더 가혹함
        const diff = feelsLike - T_OPT;
        score -= 0.5 * Math.pow(diff, 1.5);
    }
  
  
    // ------------------------------------
    // [Precipitation] Rain/Snow Logic
    // ------------------------------------
    if (pty > 0) {
        if (pty === 3 || pty === 7) { // 눈
            score -= 40; // 0점 아님, 하지만 대폭 감점
            riskFactors.push("눈길 미끄럼 주의(부상 위험 High)");
        } else { // 비
            if (tmp > 23) {
                score -= 10; // 여름 비 (우중주)
            } else if (tmp < 5) {
                score -= 50; // 겨울 비 (위험)
                riskFactors.push("저체온증 위험(차가운 비)");
            } else {
                score -= 25; // 일반적인 비
            }
        }
        riskFactors.push("우천 시 시야 확보 필수");
    } else if (pop >= 60) {
        score -= 10; // 예보상 비 확률
    }
  
  
    // ------------------------------------
    // [Wind] Drag Penalty (저항)
    // 체감온도에 반영되었으므로, 여기선 '물리적 저항'만 고려 (약하게)
    // ------------------------------------
    if (wsd >= 9) {
        score -= 20;
        riskFactors.push("태풍급 강풍(낙하물 주의)");
    } else if (wsd >= 6) {
        score -= 10;
        riskFactors.push("강한 맞바람");
    }
  
  
    // ------------------------------------
    // [Finalize]
    // ------------------------------------
    score = Math.max(0, Math.min(100, Math.floor(score)));
  
    // 등급 산정
    let grade: ScoreResult['grade'] = 'WORST';
    if (score >= 90) grade = 'BEST';
    else if (score >= 70) grade = 'GOOD';
    else if (score >= 50) grade = 'SOSO';
    else if (score >= 30) grade = 'BAD';
  
    // 코멘트/추천 (연속적 점수에 따른 구간별 텍스트)
    let mainComment = "";
    let recommendation = "";
  
    if (feelsLike < -10) {
        mainComment = "혹한기 훈련 (부상 주의)";
        recommendation = "방한용품 풀장착 (귀마개, 넥워머)";
    } else if (feelsLike < 0) {
        mainComment = "꽤 춥습니다 (웜업 필수)";
        recommendation = "기모 상하의 + 윈드브레이커 + 장갑";
    } else if (feelsLike < 8) {
        mainComment = "상쾌하지만 쌀쌀해요";
        recommendation = "긴팔 + 얇은 자켓 or 조끼";
    } else if (feelsLike < 15) {
        mainComment = "🥇 PB 달성 최적의 날씨";
        recommendation = "싱글렛/반팔 + 토시 + 장갑";
    } else if (feelsLike < 22) {
        mainComment = "달리기 좋은 날";
        recommendation = "반팔 + 숏팬츠";
    } else if (feelsLike < 27) {
        mainComment = "땀이 많이 나는 날씨";
        recommendation = "싱글렛 + 숏팬츠 + 급수 필수";
    } else {
        mainComment = "위험한 더위입니다";
        recommendation = "실내 러닝 권장 (또는 새벽/야간)";
    }
  
    // 눈/비 오면 코멘트 덮어쓰기 (우선순위 상향)
    if (pty === 3) mainComment = "🌨️ 눈 오는 날 (안전 제일)";
    else if (pty > 0) mainComment = "☔️ 우중런 (미끄럼 주의)";
  
    return {
        score,
        grade,
        mainComment,
        recommendation,
        feelsLike: feelsLikeInt,
        riskFactors
    };
  }