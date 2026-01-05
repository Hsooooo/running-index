// src/lib/time-utils.ts

// 1. 단기예보용 (기존 유지) - 3시간 단위 (02, 05, 08...)
export function getBaseDateTime() {
    const now = new Date();
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstDate = new Date(now.getTime() + kstOffset);
    
    const hours = kstDate.getUTCHours();
    const minutes = kstDate.getUTCMinutes();
    
    // Base Time 로직 (API 제공 시간 고려)
    const baseTimes = [2, 5, 8, 11, 14, 17, 20, 23];
    let selectedBaseTime = baseTimes[baseTimes.length - 1]; 
    let checkDate = new Date(kstDate);
  
    for (let i = baseTimes.length - 1; i >= 0; i--) {
      const bt = baseTimes[i];
      if (hours > bt || (hours === bt && minutes > 10)) {
        selectedBaseTime = bt;
        break;
      }
    }
  
    if (hours < 2 || (hours === 2 && minutes <= 10)) {
      checkDate.setDate(checkDate.getDate() - 1);
      selectedBaseTime = 23;
    }
  
    const baseDateStr = `${checkDate.getUTCFullYear()}${String(checkDate.getUTCMonth() + 1).padStart(2, '0')}${String(checkDate.getUTCDate()).padStart(2, '0')}`;
    const baseTimeStr = String(selectedBaseTime).padStart(2, '0') + "00";
  
    return { baseDate: baseDateStr, baseTime: baseTimeStr };
  }
  
  // 2. [NEW] 초단기실황용 (매시간 40분 업데이트)
  // 예: 10:30분 조회 -> 09:00 데이터 사용 / 10:50분 조회 -> 10:00 데이터 사용
  export function getLiveBaseTime() {
      const now = new Date();
      const kstOffset = 9 * 60 * 60 * 1000;
      const kstDate = new Date(now.getTime() + kstOffset);
  
      const hours = kstDate.getUTCHours();
      const minutes = kstDate.getUTCMinutes();
  
      // 40분 이전이면 1시간 전 데이터를 써야 함
      if (minutes <= 40) {
          kstDate.setHours(hours - 1);
      }
  
      const baseDateStr = `${kstDate.getUTCFullYear()}${String(kstDate.getUTCMonth() + 1).padStart(2, '0')}${String(kstDate.getUTCDate()).padStart(2, '0')}`;
      const baseTimeStr = String(kstDate.getUTCHours()).padStart(2, '0') + "00";
  
      return { baseDate: baseDateStr, baseTime: baseTimeStr };
  }