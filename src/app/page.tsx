'use client';
import { useState } from 'react';
import { dfs_xy_conv } from '../lib/dfs-xy-conv';

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [locationName, setLocationName] = useState(""); // 현재 위치 이름
  const [searchQuery, setSearchQuery] = useState("");   // 검색어 상태
  const [isSearching, setIsSearching] = useState(false); // 검색 UI 토글

  // 1. 날씨 조회 함수 (공통 사용)
  const fetchWeather = async (lat: number, lon: number, name: string) => {
    setLoading(true);
    try {
      // (1) 좌표 -> 기상청 격자 변환
      const { x, y } = dfs_xy_conv("toXY", lat, lon);
      
      // (2) 날씨 API 호출
      const res = await fetch(`/api/running-score?nx=${x}&ny=${y}`);
      const json = await res.json();
      
      setData(json);
      setLocationName(name); // 위치 이름 업데이트
      setIsSearching(false); // 검색창 닫기
    } catch (e) {
      console.error(e);
      alert("날씨 조회 실패");
    } finally {
      setLoading(false);
    }
  };

  // 2. [현재 위치] 버튼 클릭 시
  const handleCurrentLocation = () => {
    if (!navigator.geolocation) return alert("위치 정보 미지원");
    setLoading(true);

    navigator.geolocation.getCurrentPosition(async (position) => {
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;

      // (1) 좌표로 주소 이름 가져오기 (카카오 API)
      try {
        const addrRes = await fetch(`/api/location?type=coord&x=${lon}&y=${lat}`);
        const addrData = await addrRes.json();
        
        // 행정동(H) 정보 찾기
        const region = addrData.documents.find((d: any) => d.region_type === 'H') || addrData.documents[0];
        const fullName = `${region.region_1depth_name} ${region.region_3depth_name}`; // 예: 서울특별시 망원동

        // (2) 날씨 조회 실행
        await fetchWeather(lat, lon, fullName);

      } catch (e) {
        // 주소 못 가져와도 날씨는 조회되게
        await fetchWeather(lat, lon, "현재 위치");
      }
    }, () => {
        alert("위치 권한을 허용해주세요.");
        setLoading(false);
    });
  };

  // 3. [검색] 엔터 키 처리
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery) return;

    try {
      const res = await fetch(`/api/location?type=search&query=${searchQuery}`);
      const json = await res.json();

      if (json.documents && json.documents.length > 0) {
        const first = json.documents[0]; // 첫 번째 검색 결과 사용
        const lat = Number(first.y);
        const lon = Number(first.x);
        const name = first.address_name; // 예: 서울 마포구 망원동

        await fetchWeather(lat, lon, name);
      } else {
        alert("검색 결과가 없습니다. (예: '망원동')");
      }
    } catch (e) {
      alert("검색 중 오류가 발생했습니다.");
    }
  };

  // --- 렌더링 ---
  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-blue-600";
    if (score >= 50) return "text-yellow-500";
    return "text-red-500";
  };

  return (
    <main className="flex min-h-screen flex-col items-center p-4 bg-gray-100 pb-10">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl overflow-hidden min-h-[600px]">
        
        {/* 헤더 & 검색 */}
        <div className="p-6 bg-blue-600 text-white">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-xl font-bold">🏃 러닝 웨더</h1>
            <button onClick={() => setIsSearching(!isSearching)} className="text-sm bg-blue-700 px-3 py-1 rounded-full">
              {isSearching ? "닫기" : "다른 동네 찾기 🔍"}
            </button>
          </div>

          {/* 검색창 (토글) */}
          {isSearching && (
            <form onSubmit={handleSearch} className="flex gap-2 mb-4">
                <input 
                    type="text" 
                    placeholder="동네 이름 (예: 판교동)" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 px-4 py-2 rounded-lg text-black outline-none"
                />
                <button type="submit" className="bg-blue-800 px-4 py-2 rounded-lg font-bold">
                    Go
                </button>
            </form>
          )}

          {/* 현재 조회 중인 위치 표시 */}
          {data && (
             <div className="flex items-center justify-center gap-2 mt-2 opacity-90">
                <span className="text-sm">📍 {locationName}</span>
             </div>
          )}
        </div>

        {/* 초기 화면 (데이터 없을 때) */}
        {!data && !loading && (
          <div className="p-10 flex flex-col items-center justify-center h-[400px]">
            <p className="text-gray-500 mb-6">어디서 달리실 건가요?</p>
            <button 
              onClick={handleCurrentLocation}
              className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-4 px-8 rounded-full shadow-lg transition w-full"
            >
              📍 현재 위치로 확인
            </button>
            <p className="mt-4 text-xs text-gray-400">또는 상단 버튼을 눌러 검색하세요</p>
          </div>
        )}

        {/* 로딩 중 */}
        {loading && (
            <div className="p-20 text-center text-gray-500">
                날씨와 바람을 분석 중입니다... ☁️
            </div>
        )}

        {/* 결과 화면 */}
        {data && !loading && (
          <div className="animate-fade-in-up">
            {/* 1. 메인 섹션 */}
            <div className="p-8 text-center border-b border-gray-100">
              <div className={`text-7xl font-black mb-2 ${getScoreColor(data.current.score)}`}>
                {data.current.score}
              </div>
              <p className="text-xl font-medium text-gray-700">{data.current.mainComment}</p>
              
              <div className="flex justify-center gap-6 mt-6 text-gray-600">
                <div className="flex flex-col">
                    <span className="text-xs text-gray-400">기온</span>
                    <span className="font-bold">{data.current.weather.tmp}°</span>
                </div>
                <div className="flex flex-col">
                    <span className="text-xs text-blue-500 font-bold">체감</span>
                    <span className="font-bold text-blue-600">
                        {data.current.weather.feelsLike}°
                    </span>
                </div>
                <div className="flex flex-col">
                    <span className="text-xs text-gray-400">풍속</span>
                    <span className="font-bold">{data.current.weather.wsd}m/s</span>
                </div>
              </div>

               {/* 옷차림 추천 박스 */}
               <div className="mt-6 bg-blue-50 p-3 rounded-xl text-blue-800 text-sm font-semibold">
                  👕 {data.current.recommendation}
               </div>
            </div>
            {/* Risk Factors 표시 */}
            {data.current.riskFactors.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2 mt-2">
                {data.current.riskFactors.map((risk: string, i: number) => (
                  <span key={i} className="bg-red-100 text-red-600 text-xs px-2 py-1 rounded-full font-bold">
                    ⚠️ {risk}
                  </span>
                ))}
              </div>
            )}

            {/* 2. 하단 예보 리스트 */}
            <div className="p-6 bg-gray-50">
              <h3 className="font-bold text-gray-700 mb-4 text-sm">오늘 밤까지의 예보</h3>
              <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide">
                {data.forecast.map((item: any, idx: number) => (
                  <div key={idx} className="flex-shrink-0 w-20 flex flex-col items-center bg-white p-3 rounded-xl shadow-sm border border-gray-100">
                    <span className="text-xs text-gray-400 mb-1">{item.displayTime}</span>
                    <span className={`font-bold text-lg mb-1 ${getScoreColor(item.score)}`}>
                        {item.score}
                    </span>
                    <span className="text-xs text-gray-600 mb-1">{item.weather.tmp}°</span>
                    <span className="text-[10px] text-gray-400">
                         {item.weather.feelsLike}°
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}