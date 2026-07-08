export interface VietnamBank {
  id: number;
  name: string;
  code: string;
  bin: string;
  shortName: string;
  logo?: string;
}

export const vietnamBanksStatic: VietnamBank[] = [
  { id: 17, name: "Ngân hàng TMCP Công thương Việt Nam", code: "ICB", bin: "970415", shortName: "VietinBank" },
  { id: 43, name: "Ngân hàng TMCP Ngoại Thương Việt Nam", code: "VCB", bin: "970436", shortName: "Vietcombank" },
  { id: 4, name: "Ngân hàng TMCP Đầu tư và Phát triển Việt Nam", code: "BIDV", bin: "970418", shortName: "BIDV" },
  { id: 42, name: "Ngân hàng Nông nghiệp và Phát triển Nông thôn Việt Nam", code: "VBA", bin: "970405", shortName: "Agribank" },
  { id: 26, name: "Ngân hàng TMCP Phương Đông", code: "OCB", bin: "970448", shortName: "OCB" },
  { id: 21, name: "Ngân hàng TMCP Quân đội", code: "MB", bin: "970422", shortName: "MBBank" },
  { id: 38, name: "Ngân hàng TMCP Kỹ thương Việt Nam", code: "TCB", bin: "970407", shortName: "Techcombank" },
  { id: 2, name: "Ngân hàng TMCP Á Châu", code: "ACB", bin: "970416", shortName: "ACB" },
  { id: 47, name: "Ngân hàng TMCP Việt Nam Thịnh Vượng", code: "VPB", bin: "970432", shortName: "VPBank" },
  { id: 39, name: "Ngân hàng TMCP Tiên Phong", code: "TPB", bin: "970423", shortName: "TPBank" },
  { id: 36, name: "Ngân hàng TMCP Sài Gòn Thương Tín", code: "STB", bin: "970403", shortName: "Sacombank" },
  { id: 12, name: "Ngân hàng TMCP Phát triển Thành phố Hồ Chí Minh", code: "HDB", bin: "970437", shortName: "HDBank" },
  { id: 44, name: "Ngân hàng TMCP Bản Việt", code: "VCCB", bin: "970454", shortName: "VietCapitalBank" },
  { id: 31, name: "Ngân hàng TMCP Sài Gòn", code: "SCB", bin: "970429", shortName: "SCB" },
  { id: 45, name: "Ngân hàng TMCP Quốc tế Việt Nam", code: "VIB", bin: "970441", shortName: "VIB" },
  { id: 35, name: "Ngân hàng TMCP Sài Gòn - Hà Nội", code: "SHB", bin: "970443", shortName: "SHB" },
  { id: 10, name: "Ngân hàng TMCP Xuất Nhập khẩu Việt Nam", code: "EIB", bin: "970431", shortName: "Eximbank" },
  { id: 22, name: "Ngân hàng TMCP Hàng Hải Việt Nam", code: "MSB", bin: "970426", shortName: "MSB" },
  { id: 53, name: "TMCP Việt Nam Thịnh Vượng - Ngân hàng số CAKE by VPBank", code: "CAKE", bin: "546034", shortName: "CAKE" },
  { id: 54, name: "TMCP Việt Nam Thịnh Vượng - Ngân hàng số Ubank by VPBank", code: "Ubank", bin: "546035", shortName: "Ubank" },
  { id: 57, name: "Tổng Công ty Dịch vụ số Viettel - Chi nhánh tập đoàn công nghiệp viễn thông Quân Đội", code: "VTLMONEY", bin: "971005", shortName: "ViettelMoney" },
  { id: 58, name: "Ngân hàng số Timo by Ban Viet Bank", code: "TIMO", bin: "963388", shortName: "Timo" },
  { id: 56, name: "VNPT Money", code: "VNPTMONEY", bin: "971011", shortName: "VNPTMoney" },
  { id: 34, name: "Ngân hàng TMCP Sài Gòn Công Thương", code: "SGICB", bin: "970400", shortName: "SaigonBank" },
  { id: 3, name: "Ngân hàng TMCP Bắc Á", code: "BAB", bin: "970409", shortName: "BacABank" },
  { id: 65, name: "CTCP Dịch Vụ Di Động Trực Tuyến", code: "momo", bin: "971025", shortName: "MoMo" },
  { id: 64, name: "Ngân hàng TMCP Đại Chúng Việt Nam Ngân hàng số", code: "PVDB", bin: "971133", shortName: "PVcomBank Pay" },
  { id: 30, name: "Ngân hàng TMCP Đại Chúng Việt Nam", code: "PVCB", bin: "970412", shortName: "PVcomBank" },
  { id: 27, name: "Ngân hàng TNHH MTV Việt Nam Hiện Đại", code: "MBV", bin: "970414", shortName: "MBV" },
  { id: 24, name: "Ngân hàng TMCP Quốc Dân", code: "NCB", bin: "970419", shortName: "NCB" },
  { id: 37, name: "Ngân hàng TNHH MTV Shinhan Việt Nam", code: "SHBVN", bin: "970424", shortName: "ShinhanBank" },
  { id: 1, name: "Ngân hàng TMCP An Bình", code: "ABB", bin: "970425", shortName: "ABBANK" },
  { id: 41, name: "Ngân hàng TMCP Việt Á", code: "VAB", bin: "970427", shortName: "VietABank" },
  { id: 23, name: "Ngân hàng TMCP Nam Á", code: "NAB", bin: "970428", shortName: "NamABank" },
  { id: 29, name: "Ngân hàng TMCP Thịnh vượng và Phát triển", code: "PGB", bin: "970430", shortName: "PGBank" },
  { id: 46, name: "Ngân hàng TMCP Việt Nam Thương Tín", code: "VIETBANK", bin: "970433", shortName: "VietBank" },
  { id: 5, name: "Ngân hàng TMCP Bảo Việt", code: "BVB", bin: "970438", shortName: "BaoVietBank" },
  { id: 33, name: "Ngân hàng TMCP Đông Nam Á", code: "SEAB", bin: "970440", shortName: "SeABank" },
  { id: 52, name: "Ngân hàng Hợp tác xã Việt Nam", code: "COOPBANK", bin: "970446", shortName: "COOPBANK" },
  { id: 20, name: "Ngân hàng TMCP Lộc Phát Việt Nam", code: "LPB", bin: "970449", shortName: "LPBank" },
  { id: 19, name: "Ngân hàng TMCP Kiên Long", code: "KLB", bin: "970452", shortName: "KienLongBank" },
  { id: 55, name: "Ngân hàng Đại chúng TNHH Kasikornbank", code: "KBank", bin: "668888", shortName: "KBank" },
  { id: 62, name: "Công ty Tài chính TNHH MTV Mirae Asset (Việt Nam)", code: "MAFC", bin: "977777", shortName: "MAFC" },
  { id: 13, name: "Ngân hàng TNHH MTV Hong Leong Việt Nam", code: "HLBVN", bin: "970442", shortName: "HongLeong" },
  { id: 61, name: "Ngân hàng KEB Hana – Chi nhánh Hà Nội", code: "KEBHANAHN", bin: "970467", shortName: "KEBHANAHN" },
  { id: 60, name: "Ngân hàng KEB Hana – Chi nhánh Thành phố Hồ Chí Minh", code: "KEBHANAHCM", bin: "970466", shortName: "KEBHanaHCM" },
  { id: 59, name: "Ngân hàng Citibank, N.A. - Chi nhánh Hà Nội", code: "CITIBANK", bin: "533948", shortName: "Citibank" },
  { id: 6, name: "Ngân hàng Thương mại TNHH MTV Xây dựng Việt Nam", code: "CBB", bin: "970444", shortName: "CBBank" },
  { id: 7, name: "Ngân hàng TNHH MTV CIMB Việt Nam", code: "CIMB", bin: "422589", shortName: "CIMB" },
  { id: 8, name: "DBS Bank Ltd - Chi nhánh Thành phố Hồ Chí Minh", code: "DBS", bin: "796500", shortName: "DBSBank" },
  { id: 9, name: "Ngân hàng TNHH MTV Số Vikki", code: "Vikki", bin: "970406", shortName: "Vikki" },
  { id: 63, name: "Ngân hàng Chính sách Xã hội", code: "VBSP", bin: "999888", shortName: "VBSP" },
  { id: 11, name: "Ngân hàng Thương mại TNHH MTV Dầu Khí Toàn Cầu", code: "GPB", bin: "970408", shortName: "GPBank" },
  { id: 51, name: "Ngân hàng Kookmin - Chi nhánh Thành phố Hồ Chí Minh", code: "KBHCM", bin: "970463", shortName: "KookminHCM" },
  { id: 50, name: "Ngân hàng Kookmin - Chi nhánh Hà Nội", code: "KBHN", bin: "970462", shortName: "KookminHN" },
  { id: 49, name: "Ngân hàng TNHH MTV Woori Việt Nam", code: "WVN", bin: "970457", shortName: "Woori" },
  { id: 48, name: "Ngân hàng Liên doanh Việt - Nga", code: "VRB", bin: "970421", shortName: "VRB" },
  { id: 14, name: "Ngân hàng TNHH MTV HSBC (Việt Nam)", code: "HSBC", bin: "458761", shortName: "HSBC" },
  { id: 15, name: "Ngân hàng Công nghiệp Hàn Quốc - Chi nhánh Hà Nội", code: "IBK - HN", bin: "970455", shortName: "IBKHN" },
  { id: 16, name: "Ngân hàng Công nghiệp Hàn Quốc - Chi nhánh TP. Hồ Chí Minh", code: "IBK - HCM", bin: "970456", shortName: "IBKHCM" },
  { id: 18, name: "Ngân hàng TNHH Indovina", code: "IVB", bin: "970434", shortName: "IndovinaBank" },
  { id: 40, name: "Ngân hàng United Overseas - Chi nhánh TP. Hồ Chí Minh", code: "UOB", bin: "970458", shortName: "UnitedOverseas" },
  { id: 25, name: "Ngân hàng Nonghyup - Chi nhánh Hà Nội", code: "NHB HN", bin: "801011", shortName: "Nonghyup" },
  { id: 32, name: "Ngân hàng TNHH MTV Standard Chartered Bank Việt Nam", code: "SCVN", bin: "970410", shortName: "StandardChartered" },
  { id: 28, name: "Ngân hàng TNHH MTV Public Việt Nam", code: "PBVN", bin: "970439", shortName: "PublicBank" }
];

export async function getVietnamBanks(): Promise<VietnamBank[]> {
  if (typeof window === 'undefined') {
    return vietnamBanksStatic;
  }

  try {
    const cached = localStorage.getItem('vietnam_banks');
    const cachedTime = localStorage.getItem('vietnam_banks_fetched_at');
    const oneDay = 24 * 60 * 60 * 1000;

    if (cached && cachedTime && (Date.now() - parseInt(cachedTime, 10) < oneDay)) {
      return JSON.parse(cached);
    }

    const res = await fetch('https://api.vietqr.io/v2/banks');
    if (!res.ok) throw new Error('Failed to fetch from API');
    
    const json = await res.json();
    if (json.code === '00' && Array.isArray(json.data)) {
      const banksData: VietnamBank[] = json.data.map((b: any) => ({
        id: b.id,
        name: b.name,
        code: b.code,
        bin: b.bin,
        shortName: b.shortName || b.short_name || b.code,
        logo: b.logo
      }));
      localStorage.setItem('vietnam_banks', JSON.stringify(banksData));
      localStorage.setItem('vietnam_banks_fetched_at', Date.now().toString());
      return banksData;
    }
    
    throw new Error('Invalid response structure');
  } catch (err) {
    console.warn('Failed to fetch live Vietnam banks, using static fallback:', err);
    return vietnamBanksStatic;
  }
}
