import { SportTemplate } from './types';

export const SPORT_TEMPLATES: Record<string, SportTemplate> = {
  volleyball: {
    id: 'volleyball',
    name: 'Volleyball',
    thaiName: 'วอลเลย์บอล',
    teamsEnabled: true,
    playersEnabled: true,
    skills: [
      { id: 'sv', code: 'SV', name: 'Serve', thaiName: 'เสิร์ฟ' },
      { id: 'rec', code: 'REC', name: 'Receive', thaiName: 'รับเสิร์ฟ' },
      { id: 'set', code: 'SET', name: 'Set', thaiName: 'เซต' },
      { id: 'spk', code: 'SPK', name: 'Spike', thaiName: 'ตบ' },
      { id: 'blk', code: 'BLK', name: 'Block', thaiName: 'บล็อก' },
      { id: 'dig', code: 'DIG', name: 'Dig', thaiName: 'รับตบ' },
      { id: 'und', code: 'UND', name: 'Under', thaiName: 'รับล่าง' },
    ],
    areas: [
      { id: 'ln', code: 'LN', thaiName: 'ซ้ายหน้า (LN)', type: 'court', shortcutKey: 'a' },
      { id: 'cn', code: 'CN', thaiName: 'กลางหน้า (CN)', type: 'court', shortcutKey: 's' },
      { id: 'rn', code: 'RN', thaiName: 'ขวาหน้า (RN)', type: 'court', shortcutKey: 'd' },
      { id: 'lb', code: 'LB', thaiName: 'ซ้ายหลัง (LB)', type: 'court', shortcutKey: 'f' },
      { id: 'cb', code: 'CB', thaiName: 'กลางหลัง (CB)', type: 'court', shortcutKey: 'g' },
      { id: 'rb', code: 'RB', thaiName: 'ขวาหลัง (RB)', type: 'court', shortcutKey: 'h' },
      { id: 'net', code: 'NET', thaiName: 'ติดเน็ต (NET)', type: 'court' },
      { id: 'out', code: 'OUT', thaiName: 'ออกนอกสนาม', type: 'error', shortcutKey: 'j' },
      { id: 'long_out', code: 'LONG_OUT', thaiName: 'ออกหลังเส้น', type: 'error', shortcutKey: 'k' },
      { id: 'side_out', code: 'SIDE_OUT', thaiName: 'ออกข้าง', type: 'error', shortcutKey: 'l' },
      { id: 'net_err', code: 'NET_ERR', thaiName: 'ติดเน็ต / เสียเน็ต', type: 'error' },
      { id: 'unknown', code: 'UNKNOWN', thaiName: 'ไม่ระบุพื้นที่', type: 'error' },
    ],
    results: [
      { id: 'res_yes', code: 'Yes', score: 1, thaiName: 'ได้แต้ม' },
      { id: 'res_out', code: 'Out', score: -1, thaiName: 'เสียแต้ม' },
      { id: 'res_pass', code: 'Pass', score: 0, thaiName: 'เล่นต่อ' },
    ],
    descriptors: {
      SV: [
        {
          id: 'serve_type', label: 'Serve Type', thaiLabel: 'ประเภทการเสิร์ฟ', required: false, options: [
            { code: 'FLOAT', label: 'Float', thaiLabel: 'ลอย' },
            { code: 'JUMP', label: 'Jump Serve', thaiLabel: 'กระโดดเสิร์ฟ' },
            { code: 'SHORT', label: 'Short Serve', thaiLabel: 'หยอด' },
          ]
        },
      ],
      SPK: [
        {
          id: 'attack_type', label: 'Attack Type', thaiLabel: 'ประเภทการรุก', required: false, options: [
            { code: 'QUICK', label: 'Quick', thaiLabel: 'บอลเร็ว' },
            { code: 'OPEN', label: 'Open', thaiLabel: 'หัวเสา' },
            { code: 'BACK', label: 'Back Row', thaiLabel: 'สามเมตร' },
            { code: 'TIP', label: 'Tip', thaiLabel: 'หยอด' },
          ]
        }
      ]
    }
  },
  football: {
    id: 'football',
    name: 'Football',
    thaiName: 'ฟุตบอล',
    teamsEnabled: true,
    playersEnabled: true,
    skills: [
      { id: 'pas', code: 'PAS', name: 'Pass', thaiName: 'ส่งบอล' },
      { id: 'drb', code: 'DRB', name: 'Dribble', thaiName: 'เลี้ยงบอล' },
      { id: 'sht', code: 'SHT', name: 'Shot', thaiName: 'ยิงประตู' },
      { id: 'crs', code: 'CRS', name: 'Cross', thaiName: 'เปิดบอล' },
      { id: 'tkl', code: 'TKL', name: 'Tackle', thaiName: 'แย่งบอล' },
      { id: 'int', code: 'INT', name: 'Interception', thaiName: 'ตัดบอล' },
      { id: 'clr', code: 'CLR', name: 'Clear', thaiName: 'เคลียร์บอล' },
      { id: 'sav', code: 'SAV', name: 'Save', thaiName: 'เซฟ', areaRequirement: 'optional' },
    ],
    areas: [
      { id: 'att_l', code: 'ATT_L', thaiName: 'หน้าซ้าย', type: 'court' },
      { id: 'att_c', code: 'ATT_C', thaiName: 'หน้ากลาง', type: 'court' },
      { id: 'att_r', code: 'ATT_R', thaiName: 'หน้าขวา', type: 'court' },
      { id: 'mid_l', code: 'MID_L', thaiName: 'กลางซ้าย', type: 'court' },
      { id: 'mid_c', code: 'MID_C', thaiName: 'กลาง', type: 'court' },
      { id: 'mid_r', code: 'MID_R', thaiName: 'กลางขวา', type: 'court' },
      { id: 'def_l', code: 'DEF_L', thaiName: 'หลังซ้าย', type: 'court' },
      { id: 'def_c', code: 'DEF_C', thaiName: 'หลังกลาง', type: 'court' },
      { id: 'def_r', code: 'DEF_R', thaiName: 'หลังขวา', type: 'court' },
      { id: 'box', code: 'BOX', thaiName: 'กรอบเขตโทษ', type: 'court' },
      { id: 'goal', code: 'GOAL', thaiName: 'หน้าประตู', type: 'court' },
      { id: 'out', code: 'OUT', thaiName: 'ออกนอกสนาม', type: 'error' },
      { id: 'unknown', code: 'UNKNOWN', thaiName: 'ไม่ระบุพื้นที่', type: 'error' },
    ],
    results: [
      { id: 'res_yes', code: 'Yes', score: 1, thaiName: 'สำเร็จ / ได้เปรียบ' },
      { id: 'res_out', code: 'Out', score: -1, thaiName: 'พลาด / เสียบอล' },
      { id: 'res_pass', code: 'Pass', score: 0, thaiName: 'เล่นต่อ' },
    ],
    descriptors: {
      PAS: [
        {
          id: 'direction', label: 'Direction', thaiLabel: 'ทิศทาง', required: false, options: [
            { code: 'FWD', label: 'Forward', thaiLabel: 'ไปข้างหน้า' },
            { code: 'BWD', label: 'Backward', thaiLabel: 'คืนหลัง' },
            { code: 'LEFT', label: 'Left', thaiLabel: 'ออกซ้าย' },
            { code: 'RIGHT', label: 'Right', thaiLabel: 'ออกขวา' },
          ]
        },
        {
          id: 'pressure', label: 'Pressure', thaiLabel: 'ความกดดัน', required: false, options: [
            { code: 'NO', label: 'No Pressure', thaiLabel: 'ไม่มีคนบีบ' },
            { code: 'PRESS', label: 'Pressured', thaiLabel: 'ถูกบีบ' },
          ]
        },
        {
          id: 'result_detail', label: 'Result Detail', thaiLabel: 'ผลลัพธ์ย่อย', required: false, options: [
            { code: 'CMP', label: 'Completed', thaiLabel: 'สำเร็จ' },
            { code: 'INT', label: 'Intercepted', thaiLabel: 'ถูกตัด' },
            { code: 'OUT', label: 'Out', thaiLabel: 'ออก' },
          ]
        }
      ],
      SHT: [
        {
          id: 'foot', label: 'Foot / Part', thaiLabel: 'ส่วนที่ใช้ยิง', required: false, options: [
            { code: 'LEFT', label: 'Left', thaiLabel: 'เท้าซ้าย' },
            { code: 'RIGHT', label: 'Right', thaiLabel: 'เท้าขวา' },
            { code: 'HEAD', label: 'Header', thaiLabel: 'โหม่ง' },
          ]
        },
        {
          id: 'shot_res', label: 'Shot Result', thaiLabel: 'ผลการยิง', required: false, options: [
            { code: 'GOAL', label: 'Goal', thaiLabel: 'เข้าประตู' },
            { code: 'ON', label: 'On Target', thaiLabel: 'ตรงกรอบ' },
            { code: 'OFF', label: 'Off Target', thaiLabel: 'หลุดกรอบ' },
            { code: 'BLK', label: 'Blocked', thaiLabel: 'โดนบล็อก' },
          ]
        },
        {
          id: 'pressure', label: 'Pressure', thaiLabel: 'ความกดดัน', required: false, options: [
            { code: 'OPEN', label: 'Open', thaiLabel: 'โล่ง' },
            { code: 'PRESS', label: 'Pressured', thaiLabel: 'ถูกบีบ' },
          ]
        }
      ],
      DRB: [
        {
          id: 'result', label: 'Result', thaiLabel: 'ผลลัพธ์', required: false, options: [
            { code: 'SUCCESS', label: 'Success', thaiLabel: 'ผ่าน' },
            { code: 'LOST', label: 'Lost', thaiLabel: 'เสียบอล' },
            { code: 'FOUL', label: 'Foul', thaiLabel: 'ถูกฟาวล์' },
          ]
        }
      ]
    }
  },
  badminton: {
    id: 'badminton',
    name: 'Badminton',
    thaiName: 'แบดมินตัน',
    teamsEnabled: true,
    playersEnabled: true,
    skills: [
      { id: 'ser', code: 'SER', name: 'Serve', thaiName: 'เสิร์ฟ' },
      { id: 'clr', code: 'CLR', name: 'Clear', thaiName: 'ลูกโด่ง' },
      { id: 'drp', code: 'DRP', name: 'Drop', thaiName: 'หยอด' },
      { id: 'smh', code: 'SMH', name: 'Smash', thaiName: 'ตบ' },
      { id: 'drv', code: 'DRV', name: 'Drive', thaiName: 'ไดรฟ์' },
      { id: 'net', code: 'NET', name: 'Net Shot', thaiName: 'หน้าเน็ต' },
      { id: 'lft', code: 'LFT', name: 'Lift', thaiName: 'ยก' },
      { id: 'def', code: 'DEF', name: 'Defense', thaiName: 'รับ' },
    ],
    areas: [
      { id: 'fl', code: 'FL', thaiName: 'หน้าซ้าย', type: 'court' },
      { id: 'fc', code: 'FC', thaiName: 'หน้ากลาง', type: 'court' },
      { id: 'fr', code: 'FR', thaiName: 'หน้าขวา', type: 'court' },
      { id: 'ml', code: 'ML', thaiName: 'กลางซ้าย', type: 'court' },
      { id: 'mc', code: 'MC', thaiName: 'กลาง', type: 'court' },
      { id: 'mr', code: 'MR', thaiName: 'กลางขวา', type: 'court' },
      { id: 'bl', code: 'BL', thaiName: 'หลังซ้าย', type: 'court' },
      { id: 'bc', code: 'BC', thaiName: 'หลังกลาง', type: 'court' },
      { id: 'br', code: 'BR', thaiName: 'หลังขวา', type: 'court' },
      { id: 'out', code: 'OUT', thaiName: 'ออกนอกสนาม', type: 'error' },
      { id: 'net_err', code: 'NET_ERR', thaiName: 'ติดเน็ต / เสียเน็ต', type: 'error' },
      { id: 'unknown', code: 'UNKNOWN', thaiName: 'ไม่ระบุพื้นที่', type: 'error' },
    ],
    results: [
      { id: 'res_yes', code: 'Yes', score: 1, thaiName: 'ได้แต้ม' },
      { id: 'res_out', code: 'Out', score: -1, thaiName: 'เสียแต้ม' },
      { id: 'res_pass', code: 'Pass', score: 0, thaiName: 'เล่นต่อ' },
    ],
    descriptors: {
      SMH: [
        {
          id: 'hand', label: 'Hand', thaiLabel: 'ลักษณะตี', required: false, options: [
            { code: 'FH', label: 'Forehand', thaiLabel: 'โฟร์แฮนด์' },
            { code: 'BH', label: 'Backhand', thaiLabel: 'แบ็คแฮนด์' },
          ]
        },
        {
          id: 'height', label: 'Height', thaiLabel: 'ความสูง', required: false, options: [
            { code: 'HIGH', label: 'High', thaiLabel: 'สูง' },
            { code: 'MID', label: 'Mid', thaiLabel: 'กลาง' },
            { code: 'LOW', label: 'Low', thaiLabel: 'ต่ำ' },
          ]
        }
      ]
    }
  },
  basketball: {
    id: 'basketball',
    name: 'Basketball',
    thaiName: 'บาสเกตบอล',
    teamsEnabled: true,
    playersEnabled: true,
    skills: [
      { id: 'pas', code: 'PAS', name: 'Pass', thaiName: 'ส่งบอล' },
      { id: 'drb', code: 'DRB', name: 'Dribble', thaiName: 'เลี้ยงบอล' },
      { id: 'sht', code: 'SHT', name: 'Shot', thaiName: 'ยิง' },
      { id: 'lay', code: 'LAY', name: 'Layup', thaiName: 'เลย์อัพ' },
      { id: 'reb', code: 'REB', name: 'Rebound', thaiName: 'รีบาวด์' },
      { id: 'stl', code: 'STL', name: 'Steal', thaiName: 'สตีล' },
      { id: 'blk', code: 'BLK', name: 'Block', thaiName: 'บล็อก' },
      { id: 'to', code: 'TO', name: 'Turnover', thaiName: 'เสียบอล' },
    ],
    areas: [
      { id: 'paint', code: 'PAINT', thaiName: 'ใต้แป้น', type: 'court' },
      { id: 'left_wing', code: 'LEFT_WING', thaiName: 'ปีกซ้าย', type: 'court' },
      { id: 'right_wing', code: 'RIGHT_WING', thaiName: 'ปีกขวา', type: 'court' },
      { id: 'top_key', code: 'TOP_KEY', thaiName: 'ตรงกลางหัวกะโหลก', type: 'court' },
      { id: 'left_corner', code: 'LEFT_CORNER', thaiName: 'มุมซ้าย', type: 'court' },
      { id: 'right_corner', code: 'RIGHT_CORNER', thaiName: 'มุมขวา', type: 'court' },
      { id: 'mid_range', code: 'MID_RANGE', thaiName: 'ระยะกลาง', type: 'court' },
      { id: 'three_pt', code: 'THREE_PT', thaiName: 'สามแต้ม', type: 'court' },
      { id: 'out', code: 'OUT', thaiName: 'ออกนอกสนาม', type: 'error' },
      { id: 'unknown', code: 'UNKNOWN', thaiName: 'ไม่ระบุพื้นที่', type: 'error' },
    ],
    results: [
      { id: 'res_yes', code: 'Yes', score: 1, thaiName: 'สำเร็จ / ได้แต้ม' },
      { id: 'res_out', code: 'Out', score: -1, thaiName: 'พลาด' },
      { id: 'res_pass', code: 'Pass', score: 0, thaiName: 'เล่นต่อ' },
    ],
    descriptors: {
      SHT: [
        {
          id: 'shot_type', label: 'Shot Type', thaiLabel: 'ประเภทการยิง', required: false, options: [
            { code: '2PT', label: '2PT', thaiLabel: '2 แต้ม' },
            { code: '3PT', label: '3PT', thaiLabel: '3 แต้ม' },
            { code: 'FT', label: 'FT', thaiLabel: 'ลูกโทษ' },
          ]
        },
        {
          id: 'def', label: 'Defense', thaiLabel: 'การป้องกัน', required: false, options: [
            { code: 'OPEN', label: 'Open', thaiLabel: 'ไม่มีคนกัน' },
            { code: 'CONT', label: 'Contested', thaiLabel: 'มีคนกัน' },
          ]
        }
      ]
    }
  }
};
