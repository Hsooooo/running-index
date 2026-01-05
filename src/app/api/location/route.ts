import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type'); // 'coord' (좌표->주소) or 'search' (검색->좌표)
  const query = searchParams.get('query'); // 검색어
  const x = searchParams.get('x'); // 경도 (lon)
  const y = searchParams.get('y'); // 위도 (lat)

  const KAKAO_KEY = process.env.KAKAO_REST_API_KEY;
  
  if (!KAKAO_KEY) return NextResponse.json({ error: 'No Key' }, { status: 500 });

  try {
    let url = '';
    
    // 1. 현재 위치의 행정동 이름 찾기 (Reverse Geocoding)
    if (type === 'coord') {
        // x: 경도(lon), y: 위도(lat)
        url = `https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${x}&y=${y}`;
    } 
    // 2. 검색어로 좌표 찾기 (Search Address)
    else if (type === 'search') {
        url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(query!)}`;
    }

    const res = await fetch(url, {
        headers: { Authorization: `KakaoAK ${KAKAO_KEY}` }
    });
    const data = await res.json();

    return NextResponse.json(data);

  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch location' }, { status: 500 });
  }
}