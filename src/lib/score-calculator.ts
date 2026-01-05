// src/lib/score-calculator.ts

export interface WeatherData {
    tmp: number; // 기온
    pty: number; // 강수형태
    pop: number; // 강수확률
    wsd: number; // 풍속
    reh: number; // 습도
  }
  
  export interface ScoreResult {
    score: number;
    mainComment: string;
    recommendation: string;
    feelsLike: number;
  }
  
  // 체감온도 계산 (Private Helper)
  function getWindChill(temp: number, windSpeedMs: number): number {
    if (temp > 10 || windSpeedMs < 1.3) return temp;
    const v = windSpeedMs * 3.6; // m/s -> km/h
    return 13.12 + (0.6215 * temp) - (11.37 * Math.pow(v, 0.16)) + (0.3965 * temp * Math.pow(v, 0.16));
  }
  
  // 메인 계산 함수
  export function calculateRunningScore(weather: WeatherData): ScoreResult {
    let score = 100;
    let comments: string[] = [];
    let recommendation = "";
  
    const { tmp, pty, pop, wsd, reh } = weather;
    
    // 1. 체감온도 계산
    const feelsLike = getWindChill(tmp, wsd);
  
    // 2. 강수 (눈/비)
    if (pty > 0) {
        score -= 50;
        if (pty === 3 || pty === 7) comments.push("눈길 미끄럼 주의 (부상 위험) ❄️");
        else comments.push("비가 옵니다 ☔️");
    } else if (pop >= 60) {
        score -= 30;
        comments.push("비 올 확률 높음 ☁️");
    }
  
    // 3. 기온 & 체감온도 (겨울철 로직 강화)
    if (feelsLike <= 15) {
        if (feelsLike >= 5) {
            recommendation = "가벼운 긴팔 or 반팔+토시";
        } else if (feelsLike >= 0) {
            score -= 5;
            recommendation = "긴팔 + 얇은 바람막이";
        } else if (feelsLike >= -5) {
            score -= 15;
            comments.push("체감온도 영하 (웜업 필수) ⚠️");
            recommendation = "기모 상의 + 윈드브레이커";
        } else if (feelsLike >= -10) {
            score -= 30;
            comments.push("칼바람 주의 (관절 보호) 🥶");
            recommendation = "방한용품 풀장착 (귀마개 필수)";
        } else {
            score -= 50;
            comments.push("위험한 추위 🚫");
            recommendation = "실내 운동 추천";
        }
    } else {
        // 여름/따뜻한 날
        if (tmp > 28) {
            score -= 40;
            comments.push("열사병 위험 🔥");
            recommendation = "실내 러닝 추천";
        } else if (tmp > 23) {
            score -= 15;
            comments.push("더위 주의 💦");
            recommendation = "싱글렛 + 수분 섭취";
            if (reh >= 80) {
               score -= 20; 
               comments.push("높은 습도 💧");
            }
        } else {
            recommendation = "반팔 + 숏팬츠";
        }
        
        // 적당한 바람은 가산점
        if (tmp > 20 && wsd >= 3 && wsd < 7) {
            score += 5;
            comments.push("시원한 바람 🍃");
        }
    }
  
    // 4. 강풍 페널티
    if (wsd >= 8) {
        score -= 20;
        comments.push("태풍급 바람 💨");
    } else if (wsd >= 6) {
        score -= 10;
        comments.push("맞바람 강함");
    } else if (tmp < 0 && wsd >= 4) {
        score -= 10;
        comments.push("체감온도 급격히 낮음 🧊");
    }
  
    score = Math.max(0, Math.min(100, score));
  
    if (comments.length === 0) {
        if (score >= 90) comments.push("완벽한 러닝 날씨 🏃‍♂️");
        else comments.push("달리기 좋은 날");
    }
  
    return {
        score,
        mainComment: comments[0], // 가장 중요한 코멘트 하나만 메인으로
        recommendation,
        feelsLike: Math.round(feelsLike)
    };
  }