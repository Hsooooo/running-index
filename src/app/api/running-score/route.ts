import { NextResponse } from 'next/server';
import { getBaseDateTime, getLiveBaseTime } from '../../../lib/time-utils';
import { calculateRunningScore, WeatherData } from '../../../lib/score-calculator';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const nx = searchParams.get('nx');
  const ny = searchParams.get('ny');
  const SERVICE_KEY = process.env.DATA_GO_KR_API_KEY; 

  const liveTime = getLiveBaseTime();
  const fcstTime = getBaseDateTime();

  try {
    const liveUrl = `https://apihub.kma.go.kr/api/typ02/openApi/VilageFcstInfoService_2.0/getUltraSrtNcst?authKey=${SERVICE_KEY}&pageNo=1&numOfRows=10&dataType=JSON&base_date=${liveTime.baseDate}&base_time=${liveTime.baseTime}&nx=${nx}&ny=${ny}`;
    const fcstUrl = `https://apihub.kma.go.kr/api/typ02/openApi/VilageFcstInfoService_2.0/getVilageFcst?authKey=${SERVICE_KEY}&pageNo=1&numOfRows=300&dataType=JSON&base_date=${fcstTime.baseDate}&base_time=${fcstTime.baseTime}&nx=${nx}&ny=${ny}`;

    const [liveRes, fcstRes] = await Promise.all([
        fetch(liveUrl, { next: { revalidate: 600 } }),
        fetch(fcstUrl, { next: { revalidate: 3600 } })
    ]);

    const liveData = await liveRes.json();
    const fcstData = await fcstRes.json();

    // 1. 현재 날씨 파싱
    const liveItems = liveData.response?.body?.items?.item || [];
    // WeatherData 인터페이스에 맞춰 초기화
    const currentStatus: WeatherData = { tmp: 0, pty: 0, wsd: 0, reh: 0, pop: 0 };

    liveItems.forEach((item: any) => {
        if (item.category === 'T1H') currentStatus.tmp = Number(item.obsrValue);
        if (item.category === 'PTY') currentStatus.pty = Number(item.obsrValue);
        if (item.category === 'WSD') currentStatus.wsd = Number(item.obsrValue);
        if (item.category === 'REH') currentStatus.reh = Number(item.obsrValue);
    });

    // 🔥 현재 점수 계산 (함수 호출)
    const currentResult = calculateRunningScore(currentStatus);


    // 2. 미래 예보 파싱
    const fcstItems = fcstData.response?.body?.items?.item || [];
    const weatherMap = new Map<string, WeatherData>();

    fcstItems.forEach((item: any) => {
      const key = `${item.fcstDate}${item.fcstTime}`;
      if (!weatherMap.has(key)) weatherMap.set(key, { tmp:0, pop:0, wsd:0, pty:0, reh:0 });
      
      const obj = weatherMap.get(key)!;
      const val = Number(item.fcstValue);
      if (item.category === 'TMP') obj.tmp = val;
      if (item.category === 'POP') obj.pop = val;
      if (item.category === 'WSD') obj.wsd = val;
      if (item.category === 'PTY') obj.pty = val;
      if (item.category === 'REH') obj.reh = val;
    });

    const forecastList: any[] = [];
    const now = new Date();
    const kstNow = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    const currentSortKey = Number(
        `${kstNow.getUTCFullYear()}${String(kstNow.getUTCMonth()+1).padStart(2,'0')}${String(kstNow.getUTCDate()).padStart(2,'0')}${String(kstNow.getUTCHours()).padStart(2,'0')}00`
    );

    for (const [key, weather] of weatherMap) {
        if (Number(key) <= currentSortKey) continue;

        // 🔥 미래 점수 계산 (함수 호출)
        const result = calculateRunningScore(weather);
        
        forecastList.push({
            displayTime: `${key.slice(8, 10)}:${key.slice(10, 12)}`,
            score: result.score,
            weather: { ...weather, feelsLike: result.feelsLike }, // 체감온도 포함해서 리턴
            mainComment: result.mainComment
        });
    }

    return NextResponse.json({
      current: {
          ...currentResult, // score, mainComment, recommendation, feelsLike
          weather: { ...currentStatus, feelsLike: currentResult.feelsLike },
          displayTime: "현재"
      },
      forecast: forecastList.slice(0, 12)
    });

  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}