import { SportTemplate } from './types';

export const SPORT_TEMPLATES: Record<string, SportTemplate> = {
  volleyball: {
    id: 'volleyball',
    name: 'Volleyball',
    thaiName: 'วอลเลย์บอล',
    teamsEnabled: true,
    playersEnabled: true,
    areaLayouts: {
      normal: {
        type: 'grid',
        resolution: '2x3',
        rows: 2,
        cols: 3,
        zones: [
          { id: 'ln', code: 'LN', label: 'LN', gridX: 0, gridY: 0 },
          { id: 'cn', code: 'CN', label: 'CN', gridX: 1, gridY: 0 },
          { id: 'rn', code: 'RN', label: 'RN', gridX: 2, gridY: 0 },
          { id: 'lb', code: 'LB', label: 'LB', gridX: 0, gridY: 1 },
          { id: 'cb', code: 'CB', label: 'CB', gridX: 1, gridY: 1 },
          { id: 'rb', code: 'RB', label: 'RB', gridX: 2, gridY: 1 },
        ]
      },
      detailed: {
        type: 'grid',
        resolution: '3x3',
        rows: 3,
        cols: 3,
      },
      point: {
        type: 'point',
      },
      outOfBounds: {
        type: 'out',
        outZones: ['side_left_near', 'side_left_far', 'side_right_near', 'side_right_far', 'back_left', 'back_right', 'opp_back_left', 'opp_back_right', 'net_error', 'unknown']
      }
    },
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
      { id: 'ln', code: 'LN', thaiName: 'ซ้ายหน้า', type: 'court', shortcutKey: 'a' },
      { id: 'cn', code: 'CN', thaiName: 'กลางหน้า', type: 'court', shortcutKey: 's' },
      { id: 'rn', code: 'RN', thaiName: 'ขวาหน้า', type: 'court', shortcutKey: 'd' },
      { id: 'lb', code: 'LB', thaiName: 'ซ้ายหลัง', type: 'court', shortcutKey: 'f' },
      { id: 'cb', code: 'CB', thaiName: 'กลางหลัง', type: 'court', shortcutKey: 'g' },
      { id: 'rb', code: 'RB', thaiName: 'ขวาหลัง', type: 'court', shortcutKey: 'h' },
      { id: 'net', code: 'NET', thaiName: 'ติดเน็ต', type: 'court' },
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
    fouls: [
      { code: 'NET_TOUCH', label: 'Net Touch', labelTh: 'แตะเน็ต', role: 'violation', severity: 'normal' },
      { code: 'FOOT_FAULT', label: 'Foot Fault', labelTh: 'เหยียบเส้น', role: 'violation', severity: 'normal' },
      { code: 'ROTATION', label: 'Rotation Fault', labelTh: 'ผิดตำแหน่งหมุน', role: 'violation', severity: 'normal' },
      { code: 'DOUBLE', label: 'Double Contact', labelTh: 'สัมผัสสองครั้ง', role: 'violation', severity: 'normal' },
      { code: 'FOUR_HITS', label: 'Four Hits', labelTh: 'เล่นเกิน 3 ครั้ง', role: 'violation', severity: 'normal' },
      { code: 'CARRY', label: 'Carry', labelTh: 'อุ้มบอล / พักบอล', role: 'violation', severity: 'normal' }
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
    areaLayouts: {
      normal: {
        type: 'grid',
        resolution: '3x3',
        rows: 3,
        cols: 3,
        zones: [
          { id: 'att_l', code: 'ATT_L', label: 'ATT-L', gridX: 0, gridY: 0 },
          { id: 'att_c', code: 'ATT_C', label: 'ATT-C', gridX: 1, gridY: 0 },
          { id: 'att_r', code: 'ATT_R', label: 'ATT-R', gridX: 2, gridY: 0 },
          { id: 'mid_l', code: 'MID_L', label: 'MID-L', gridX: 0, gridY: 1 },
          { id: 'mid_c', code: 'MID_C', label: 'MID-C', gridX: 1, gridY: 1 },
          { id: 'mid_r', code: 'MID_R', label: 'MID-R', gridX: 2, gridY: 1 },
          { id: 'def_l', code: 'DEF_L', label: 'DEF-L', gridX: 0, gridY: 2 },
          { id: 'def_c', code: 'DEF_C', label: 'DEF-C', gridX: 1, gridY: 2 },
          { id: 'def_r', code: 'DEF_R', label: 'DEF-R', gridX: 2, gridY: 2 },
        ]
      },
      detailed: {
        type: 'grid',
        resolution: '5x3',
        rows: 3,
        cols: 5,
      },
      point: {
        type: 'point',
      },
      outOfBounds: {
        type: 'out',
        outZones: ['left_touchline_def', 'left_touchline_mid', 'left_touchline_att', 'right_touchline_def', 'right_touchline_mid', 'right_touchline_att', 'own_endline', 'opp_endline', 'corner_left', 'corner_right', 'goal_kick', 'unknown']
      }
    },
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
    fouls: [
      { code: 'FOUL', label: 'Foul', labelTh: 'ทำฟาวล์', role: 'committed', severity: 'normal' },
      { code: 'HANDBALL', label: 'Handball', labelTh: 'แฮนด์บอล', role: 'violation', severity: 'normal' },
      { code: 'OFFSIDE', label: 'Offside', labelTh: 'ล้ำหน้า', role: 'violation', severity: 'normal' },
      { code: 'YELLOW', label: 'Yellow Card', labelTh: 'ใบเหลือง', role: 'committed', severity: 'card' },
      { code: 'RED', label: 'Red Card', labelTh: 'ใบแดง', role: 'committed', severity: 'card' },
      { code: 'PENALTY', label: 'Penalty Conceded', labelTh: 'เสียจุดโทษ', role: 'committed', severity: 'normal' }
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
    areaLayouts: {
      normal: {
        type: 'grid',
        resolution: '1x3',
        rows: 3,
        cols: 1,
        zones: [
          { id: 'front', code: 'FRONT', label: 'Front', gridX: 0, gridY: 0 },
          { id: 'mid', code: 'MID', label: 'Mid', gridX: 0, gridY: 1 },
          { id: 'back', code: 'BACK', label: 'Back', gridX: 0, gridY: 2 },
        ]
      },
      detailed: {
        type: 'grid',
        resolution: '3x3-per-side',
        rows: 3,
        cols: 3,
      },
      point: {
        type: 'point',
      },
      outOfBounds: {
        type: 'out',
        outZones: ['side_left_near', 'side_left_far', 'side_right_near', 'side_right_far', 'own_back_out', 'opp_back_out', 'net_error', 'unknown']
      }
    },
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
      { id: 'front', code: 'FRONT', thaiName: 'สนามหน้า', type: 'court' },
      { id: 'mid', code: 'MID', thaiName: 'สนามกลาง', type: 'court' },
      { id: 'back', code: 'BACK', thaiName: 'สนามหลัง', type: 'court' },
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
    fouls: [
      { code: 'SERVICE_FAULT', label: 'Service Fault', labelTh: 'เสิร์ฟผิดกติกา', role: 'violation', severity: 'normal' },
      { code: 'NET_TOUCH', label: 'Net Touch', labelTh: 'แตะเน็ต', role: 'violation', severity: 'normal' },
      { code: 'DOUBLE_HIT', label: 'Double Hit', labelTh: 'ตีสองครั้ง', role: 'violation', severity: 'normal' },
      { code: 'CARRY', label: 'Carry', labelTh: 'พักลูก / อุ้มลูก', role: 'violation', severity: 'normal' },
      { code: 'WRONG_COURT', label: 'Wrong Court', labelTh: 'ยืนผิดตำแหน่ง', role: 'violation', severity: 'normal' }
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
    areaLayouts: {
      normal: {
        type: 'zones',
        resolution: 'shot-8',
        zones: [
          { id: 'paint', code: 'PAINT', label: 'Paint', gridX: 0, gridY: 0 },
          { id: 'left_wing', code: 'LEFT_WING', label: 'Left Wing' },
          { id: 'right_wing', code: 'RIGHT_WING', label: 'Right Wing' },
          { id: 'top_key', code: 'TOP_KEY', label: 'Top Key' },
          { id: 'left_corner', code: 'LEFT_CORNER', label: 'Left Corner' },
          { id: 'right_corner', code: 'RIGHT_CORNER', label: 'Right Corner' },
          { id: 'mid', code: 'MID_RANGE', label: 'Mid-Range' },
          { id: 'three', code: 'THREE_PT', label: '3-Point' },
        ]
      },
      detailed: {
        type: 'grid',
        resolution: 'shot-12',
        rows: 4,
        cols: 3,
        // Using a 4x3 approximate grid for the 14 shot zones logic, but could just use the area codes.
      },
      point: {
        type: 'point',
      },
      outOfBounds: {
        type: 'out',
        outZones: ['left_sideline', 'right_sideline', 'baseline_left', 'baseline_right', 'endline', 'unknown']
      }
    },
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
    fouls: [
      { code: 'PERSONAL', label: 'Personal Foul', labelTh: 'ฟาวล์บุคคล', role: 'committed', severity: 'normal' },
      { code: 'OFFENSIVE', label: 'Offensive Foul', labelTh: 'ฟาวล์รุก', role: 'committed', severity: 'normal' },
      { code: 'SHOOTING', label: 'Shooting Foul', labelTh: 'ฟาวล์ขณะยิง', role: 'committed', severity: 'normal' },
      { code: 'TECHNICAL', label: 'Technical Foul', labelTh: 'ฟาวล์เทคนิค', role: 'technical', severity: 'technical' },
      { code: 'UNSPORT', label: 'Unsportsmanlike Foul', labelTh: 'ฟาวล์ไม่มีน้ำใจนักกีฬา', role: 'committed', severity: 'technical' },
      { code: 'TRAVEL', label: 'Traveling', labelTh: 'เดิน', role: 'violation', severity: 'normal' },
      { code: 'DOUBLE_DRIBBLE', label: 'Double Dribble', labelTh: 'เลี้ยงสองครั้ง', role: 'violation', severity: 'normal' }
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

export const OUT_ZONE_LABELS: Record<string, { label: string, thaiLabel: string, code: string }> = {
  // Volleyball & Badminton
  side_left_near: { label: 'Side Left (Near)', thaiLabel: 'ออกซ้าย (ใกล้)', code: 'SIDE_OUT' },
  side_left_far: { label: 'Side Left (Far)', thaiLabel: 'ออกซ้าย (ไกล)', code: 'SIDE_OUT' },
  side_right_near: { label: 'Side Right (Near)', thaiLabel: 'ออกขวา (ใกล้)', code: 'SIDE_OUT' },
  side_right_far: { label: 'Side Right (Far)', thaiLabel: 'ออกขวา (ไกล)', code: 'SIDE_OUT' },
  back_left: { label: 'Back Left', thaiLabel: 'ออกหลัง (ซ้าย)', code: 'LONG_OUT' },
  back_right: { label: 'Back Right', thaiLabel: 'ออกหลัง (ขวา)', code: 'LONG_OUT' },
  side_left: { label: 'Side Left', thaiLabel: 'ออกข้างซ้าย', code: 'SIDE_OUT' },
  side_right: { label: 'Side Right', thaiLabel: 'ออกข้างขวา', code: 'SIDE_OUT' },
  opp_back_left: { label: 'Opp Back Left', thaiLabel: 'ออกหลังซ้าย (คู่แข่ง)', code: 'LONG_OUT' },
  opp_back_right: { label: 'Opp Back Right', thaiLabel: 'ออกหลังขวา (คู่แข่ง)', code: 'LONG_OUT' },
  opp_back_out: { label: 'Opp Back Out', thaiLabel: 'ออกหลัง (คู่แข่ง)', code: 'LONG_OUT' },
  own_back_out: { label: 'Own Back Out', thaiLabel: 'ออกหลัง (ฝั่งเรา)', code: 'LONG_OUT' },
  net_error: { label: 'Net Error', thaiLabel: 'เสียเน็ต', code: 'NET_ERR' },
  unknown: { label: 'Unknown', thaiLabel: 'ไม่ระบุ', code: 'UNKNOWN' },
  
  // Football
  left_touchline_def: { label: 'Touchline (Def-L)', thaiLabel: 'ออกข้างซ้าย (รับ)', code: 'OUT' },
  left_touchline_mid: { label: 'Touchline (Mid-L)', thaiLabel: 'ออกข้างซ้าย (กลาง)', code: 'OUT' },
  left_touchline_att: { label: 'Touchline (Att-L)', thaiLabel: 'ออกข้างซ้าย (รุก)', code: 'OUT' },
  right_touchline_def: { label: 'Touchline (Def-R)', thaiLabel: 'ออกข้างขวา (รับ)', code: 'OUT' },
  right_touchline_mid: { label: 'Touchline (Mid-R)', thaiLabel: 'ออกข้างขวา (กลาง)', code: 'OUT' },
  right_touchline_att: { label: 'Touchline (Att-R)', thaiLabel: 'ออกข้างขวา (รุก)', code: 'OUT' },
  own_endline: { label: 'Own Endline', thaiLabel: 'ออกหลัง (ฝั่งเรา)', code: 'OUT' },
  opp_endline: { label: 'Opp Endline', thaiLabel: 'ออกหลัง (ฝั่งตรงข้าม)', code: 'OUT' },
  corner_left: { label: 'Corner (L)', thaiLabel: 'มุมซ้าย', code: 'OUT' },
  corner_right: { label: 'Corner (R)', thaiLabel: 'มุมขวา', code: 'OUT' },
  goal_kick: { label: 'Goal Kick', thaiLabel: 'เตะจากประตู', code: 'OUT' },

  // Basketball
  left_sideline: { label: 'Left Sideline', thaiLabel: 'ออกข้างซ้าย', code: 'OUT' },
  right_sideline: { label: 'Right Sideline', thaiLabel: 'ออกข้างขวา', code: 'OUT' },
  baseline_left: { label: 'Baseline (L)', thaiLabel: 'ออกหลัง (ซ้าย)', code: 'OUT' },
  baseline_right: { label: 'Baseline (R)', thaiLabel: 'ออกหลัง (ขวา)', code: 'OUT' },
  endline: { label: 'Endline', thaiLabel: 'ออกหลัง', code: 'OUT' },
};

export type OutZoneVisual = {
  outZone: string;
  areaCode: string;
  label: string;
  thaiLabel: string;
  edge: 'top' | 'bottom' | 'left' | 'right' | 'center' | 'corner';
  segment?: 'near' | 'far' | 'left' | 'right' | 'def' | 'mid' | 'att';
  courtSide?: 'teamA' | 'teamB' | 'neutral';
  x: number;
  y: number;
};

export type BoundaryZoneSlot =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'left-top'
  | 'left-middle'
  | 'left-bottom'
  | 'right-top'
  | 'right-middle'
  | 'right-bottom'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
  | 'center-net';

export type BoundaryZone = {
  outZone: string;
  areaCode: string;
  label: string;
  thaiLabel: string;
  slot: BoundaryZoneSlot;
  courtSide?: 'teamA' | 'teamB' | 'neutral';
};

export const BOUNDARY_ZONES_BY_SPORT: Record<string, BoundaryZone[]> = {
  volleyball: [
    { outZone: 'side_left_far', areaCode: 'SIDE_OUT', label: 'Side Left Far', thaiLabel: 'ออกข้างซ้ายไกล', slot: 'bottom-right', courtSide: 'teamB' },
    { outZone: 'side_left_near', areaCode: 'SIDE_OUT', label: 'Side Left Near', thaiLabel: 'ออกข้างซ้ายใกล้', slot: 'top-left', courtSide: 'teamA' },
    { outZone: 'side_right_far', areaCode: 'SIDE_OUT', label: 'Side Right Far', thaiLabel: 'ออกข้างขวาไกล', slot: 'top-right', courtSide: 'teamB' },
    { outZone: 'side_right_near', areaCode: 'SIDE_OUT', label: 'Side Right Near', thaiLabel: 'ออกข้างขวาใกล้', slot: 'bottom-left', courtSide: 'teamA' },
    { outZone: 'opp_back_left', areaCode: 'LONG_OUT', label: 'Back Left Far', thaiLabel: 'ออกหลังซ้ายไกล', slot: 'right-bottom', courtSide: 'teamB' },
    { outZone: 'opp_back_right', areaCode: 'LONG_OUT', label: 'Back Right Far', thaiLabel: 'ออกหลังขวาไกล', slot: 'right-top', courtSide: 'teamB' },
    { outZone: 'back_left', areaCode: 'LONG_OUT', label: 'Back Left Near', thaiLabel: 'ออกหลังซ้ายใกล้', slot: 'left-top', courtSide: 'teamA' },
    { outZone: 'back_right', areaCode: 'LONG_OUT', label: 'Back Right Near', thaiLabel: 'ออกหลังขวาใกล้', slot: 'left-bottom', courtSide: 'teamA' },
    { outZone: 'net_error', areaCode: 'NET_ERR', label: 'Net Error', thaiLabel: 'เสียเน็ต', slot: 'center-net', courtSide: 'neutral' },
  ],
  football: [
    { outZone: 'corner_left', areaCode: 'OUT', label: 'Corner Left', thaiLabel: 'มุมซ้าย', slot: 'top-left', courtSide: 'neutral' },
    { outZone: 'opp_endline', areaCode: 'OUT', label: 'Opp Endline', thaiLabel: 'ออกหลังแดนรุก', slot: 'top-center', courtSide: 'neutral' },
    { outZone: 'corner_right', areaCode: 'OUT', label: 'Corner Right', thaiLabel: 'มุมขวา', slot: 'top-right', courtSide: 'neutral' },
    { outZone: 'left_touchline_att', areaCode: 'OUT', label: 'Touchline Att (L)', thaiLabel: 'ข้างซ้ายแดนรุก', slot: 'left-top', courtSide: 'neutral' },
    { outZone: 'left_touchline_mid', areaCode: 'OUT', label: 'Touchline Mid (L)', thaiLabel: 'ข้างซ้ายแดนกลาง', slot: 'left-middle', courtSide: 'neutral' },
    { outZone: 'left_touchline_def', areaCode: 'OUT', label: 'Touchline Def (L)', thaiLabel: 'ข้างซ้ายแดนรับ', slot: 'left-bottom', courtSide: 'neutral' },
    { outZone: 'right_touchline_att', areaCode: 'OUT', label: 'Touchline Att (R)', thaiLabel: 'ข้างขวาแดนรุก', slot: 'right-top', courtSide: 'neutral' },
    { outZone: 'right_touchline_mid', areaCode: 'OUT', label: 'Touchline Mid (R)', thaiLabel: 'ข้างขวาแดนกลาง', slot: 'right-middle', courtSide: 'neutral' },
    { outZone: 'right_touchline_def', areaCode: 'OUT', label: 'Touchline Def (R)', thaiLabel: 'ข้างขวาแดนรับ', slot: 'right-bottom', courtSide: 'neutral' },
    { outZone: 'own_endline', areaCode: 'OUT', label: 'Own Endline', thaiLabel: 'ออกหลังแดนรับ', slot: 'bottom-center', courtSide: 'neutral' },
  ],
  badminton: [
    { outZone: 'side_left_far', areaCode: 'SIDE_OUT', label: 'Side Left Far', thaiLabel: 'ออกข้างซ้ายไกล', slot: 'left-top', courtSide: 'teamB' },
    { outZone: 'side_left_near', areaCode: 'SIDE_OUT', label: 'Side Left Near', thaiLabel: 'ออกข้างซ้ายใกล้', slot: 'left-bottom', courtSide: 'teamA' },
    { outZone: 'side_right_far', areaCode: 'SIDE_OUT', label: 'Side Right Far', thaiLabel: 'ออกข้างขวาไกล', slot: 'right-top', courtSide: 'teamB' },
    { outZone: 'side_right_near', areaCode: 'SIDE_OUT', label: 'Side Right Near', thaiLabel: 'ออกข้างขวาใกล้', slot: 'right-bottom', courtSide: 'teamA' },
    { outZone: 'opp_back_out', areaCode: 'LONG_OUT', label: 'Back Far', thaiLabel: 'ออกหลังไกล', slot: 'top-center', courtSide: 'teamB' },
    { outZone: 'own_back_out', areaCode: 'LONG_OUT', label: 'Back Near', thaiLabel: 'ออกหลังใกล้', slot: 'bottom-center', courtSide: 'teamA' },
    { outZone: 'net_error', areaCode: 'NET_ERR', label: 'Net Error', thaiLabel: 'เสียเน็ต', slot: 'center-net', courtSide: 'neutral' },
  ],
  basketball: [
    { outZone: 'endline', areaCode: 'OUT', label: 'Endline', thaiLabel: 'ออกหลัง (บน)', slot: 'top-center', courtSide: 'neutral' },
    { outZone: 'left_sideline', areaCode: 'OUT', label: 'Sideline Left', thaiLabel: 'ออกข้างซ้าย', slot: 'left-middle', courtSide: 'neutral' },
    { outZone: 'right_sideline', areaCode: 'OUT', label: 'Sideline Right', thaiLabel: 'ออกข้างขวา', slot: 'right-middle', courtSide: 'neutral' },
    { outZone: 'baseline_left', areaCode: 'OUT', label: 'Baseline Left', thaiLabel: 'ออกหลังซ้าย', slot: 'bottom-left', courtSide: 'neutral' },
    { outZone: 'baseline_right', areaCode: 'OUT', label: 'Baseline Right', thaiLabel: 'ออกหลังขวา', slot: 'bottom-right', courtSide: 'neutral' },
  ]
};

export const OUT_ZONE_VISUALS_BY_SPORT: Record<string, OutZoneVisual[]> = {
  volleyball: [
    { outZone: 'side_left_near', areaCode: 'SIDE_OUT', label: 'Side Left (Near)', thaiLabel: 'ออกข้างซ้ายใกล้', edge: 'left', segment: 'near', courtSide: 'teamA', x: -16, y: 75 },
    { outZone: 'side_left_far', areaCode: 'SIDE_OUT', label: 'Side Left (Far)', thaiLabel: 'ออกข้างซ้ายไกล', edge: 'left', segment: 'far', courtSide: 'teamB', x: -16, y: 25 },
    { outZone: 'side_right_near', areaCode: 'SIDE_OUT', label: 'Side Right (Near)', thaiLabel: 'ออกข้างขวาใกล้', edge: 'right', segment: 'near', courtSide: 'teamA', x: 116, y: 75 },
    { outZone: 'side_right_far', areaCode: 'SIDE_OUT', label: 'Side Right (Far)', thaiLabel: 'ออกข้างขวาไกล', edge: 'right', segment: 'far', courtSide: 'teamB', x: 116, y: 25 },
    { outZone: 'back_left', areaCode: 'LONG_OUT', label: 'Back Left', thaiLabel: 'ออกหลังซ้าย', edge: 'bottom', segment: 'left', courtSide: 'teamA', x: 20, y: 112 },
    { outZone: 'back_right', areaCode: 'LONG_OUT', label: 'Back Right', thaiLabel: 'ออกหลังขวา', edge: 'bottom', segment: 'right', courtSide: 'teamA', x: 80, y: 112 },
    { outZone: 'opp_back_left', areaCode: 'LONG_OUT', label: 'Opp Back Left', thaiLabel: 'ออกหลังซ้าย (ไกล)', edge: 'top', segment: 'left', courtSide: 'teamB', x: 20, y: -12 },
    { outZone: 'opp_back_right', areaCode: 'LONG_OUT', label: 'Opp Back Right', thaiLabel: 'ออกหลังขวา (ไกล)', edge: 'top', segment: 'right', courtSide: 'teamB', x: 80, y: -12 },
    { outZone: 'net_error', areaCode: 'NET_ERR', label: 'Net Error', thaiLabel: 'เสียเน็ต', edge: 'center', segment: 'mid', courtSide: 'neutral', x: 50, y: 50 },
  ],
  football: [
    { outZone: 'left_touchline_def', areaCode: 'OUT', label: 'Touchline Def (L)', thaiLabel: 'ออกข้างซ้ายแดนรับ', edge: 'left', segment: 'def', courtSide: 'neutral', x: -16, y: 80 },
    { outZone: 'left_touchline_mid', areaCode: 'OUT', label: 'Touchline Mid (L)', thaiLabel: 'ออกข้างซ้ายแดนกลาง', edge: 'left', segment: 'mid', courtSide: 'neutral', x: -16, y: 50 },
    { outZone: 'left_touchline_att', areaCode: 'OUT', label: 'Touchline Att (L)', thaiLabel: 'ออกข้างซ้ายแดนรุก', edge: 'left', segment: 'att', courtSide: 'neutral', x: -16, y: 20 },
    { outZone: 'right_touchline_def', areaCode: 'OUT', label: 'Touchline Def (R)', thaiLabel: 'ออกข้างขวาแดนรับ', edge: 'right', segment: 'def', courtSide: 'neutral', x: 116, y: 80 },
    { outZone: 'right_touchline_mid', areaCode: 'OUT', label: 'Touchline Mid (R)', thaiLabel: 'ออกข้างขวาแดนกลาง', edge: 'right', segment: 'mid', courtSide: 'neutral', x: 116, y: 50 },
    { outZone: 'right_touchline_att', areaCode: 'OUT', label: 'Touchline Att (R)', thaiLabel: 'ออกข้างขวาแดนรุก', edge: 'right', segment: 'att', courtSide: 'neutral', x: 116, y: 20 },
    { outZone: 'own_endline', areaCode: 'OUT', label: 'Own Endline', thaiLabel: 'ออกหลังฝั่งเรา', edge: 'bottom', segment: 'def', courtSide: 'neutral', x: 50, y: 112 },
    { outZone: 'opp_endline', areaCode: 'OUT', label: 'Opp Endline', thaiLabel: 'ออกหลังฝั่งคู่แข่ง', edge: 'top', segment: 'att', courtSide: 'neutral', x: 50, y: -12 },
    { outZone: 'corner_left', areaCode: 'OUT', label: 'Corner (L)', thaiLabel: 'มุมซ้าย', edge: 'corner', segment: 'left', courtSide: 'neutral', x: -12, y: -8 },
    { outZone: 'corner_right', areaCode: 'OUT', label: 'Corner (R)', thaiLabel: 'มุมขวา', edge: 'corner', segment: 'right', courtSide: 'neutral', x: 112, y: -8 },
  ],
  badminton: [
    { outZone: 'side_left_near', areaCode: 'SIDE_OUT', label: 'Side Left (Near)', thaiLabel: 'ออกข้างซ้าย (ใกล้)', edge: 'left', segment: 'near', courtSide: 'teamA', x: -16, y: 75 },
    { outZone: 'side_left_far', areaCode: 'SIDE_OUT', label: 'Side Left (Far)', thaiLabel: 'ออกข้างซ้าย (ไกล)', edge: 'left', segment: 'far', courtSide: 'teamB', x: -16, y: 25 },
    { outZone: 'side_right_near', areaCode: 'SIDE_OUT', label: 'Side Right (Near)', thaiLabel: 'ออกข้างขวา (ใกล้)', edge: 'right', segment: 'near', courtSide: 'teamA', x: 116, y: 75 },
    { outZone: 'side_right_far', areaCode: 'SIDE_OUT', label: 'Side Right (Far)', thaiLabel: 'ออกข้างขวา (ไกล)', edge: 'right', segment: 'far', courtSide: 'teamB', x: 116, y: 25 },
    { outZone: 'own_back_out', areaCode: 'LONG_OUT', label: 'Back Out (Near)', thaiLabel: 'ออกหลัง (ฝั่งเรา)', edge: 'bottom', segment: 'def', courtSide: 'teamA', x: 50, y: 112 },
    { outZone: 'opp_back_out', areaCode: 'LONG_OUT', label: 'Back Out (Far)', thaiLabel: 'ออกหลัง (คู่แข่ง)', edge: 'top', segment: 'att', courtSide: 'teamB', x: 50, y: -12 },
    { outZone: 'net_error', areaCode: 'NET_ERR', label: 'Net Error', thaiLabel: 'เสียเน็ต', edge: 'center', segment: 'mid', courtSide: 'neutral', x: 50, y: 50 },
  ],
  basketball: [
    { outZone: 'left_sideline', areaCode: 'OUT', label: 'Left Sideline', thaiLabel: 'ออกข้างซ้าย', edge: 'left', segment: 'mid', courtSide: 'neutral', x: -16, y: 50 },
    { outZone: 'right_sideline', areaCode: 'OUT', label: 'Right Sideline', thaiLabel: 'ออกข้างขวา', edge: 'right', segment: 'mid', courtSide: 'neutral', x: 116, y: 50 },
    { outZone: 'baseline_left', areaCode: 'OUT', label: 'Baseline (L)', thaiLabel: 'ออกหลังซ้าย', edge: 'bottom', segment: 'left', courtSide: 'neutral', x: 20, y: 112 },
    { outZone: 'baseline_right', areaCode: 'OUT', label: 'Baseline (R)', thaiLabel: 'ออกหลังขวา', edge: 'bottom', segment: 'right', courtSide: 'neutral', x: 80, y: 112 },
    { outZone: 'endline', areaCode: 'OUT', label: 'Endline', thaiLabel: 'ออกหลัง (บน)', edge: 'top', segment: 'mid', courtSide: 'neutral', x: 50, y: -12 },
  ]
};

export const DETAILED_ZONE_LABELS: Record<string, { label: string, thaiLabel: string, baseAreaCode: string, gridX: number, gridY: number }> = {
  // Volleyball 3x3 detailed zones (for each side)
  'LB-1': { label: 'Left Back (Deep)', thaiLabel: 'ซ้ายหลัง (ลึก)', baseAreaCode: 'LB', gridX: 0, gridY: 2 },
  'LB-2': { label: 'Left Back (Mid)', thaiLabel: 'ซ้ายหลัง (กลาง)', baseAreaCode: 'LB', gridX: 0, gridY: 1 },
  'LN-1': { label: 'Left Net', thaiLabel: 'ซ้ายหน้า (เน็ต)', baseAreaCode: 'LN', gridX: 0, gridY: 0 },
  'CB-1': { label: 'Center Back (Deep)', thaiLabel: 'กลางหลัง (ลึก)', baseAreaCode: 'CB', gridX: 1, gridY: 2 },
  'CB-2': { label: 'Center Back (Mid)', thaiLabel: 'กลางหลัง (กลาง)', baseAreaCode: 'CB', gridX: 1, gridY: 1 },
  'CN-1': { label: 'Center Net', thaiLabel: 'กลางหน้า (เน็ต)', baseAreaCode: 'CN', gridX: 1, gridY: 0 },
  'RB-1': { label: 'Right Back (Deep)', thaiLabel: 'ขวาหลัง (ลึก)', baseAreaCode: 'RB', gridX: 2, gridY: 2 },
  'RB-2': { label: 'Right Back (Mid)', thaiLabel: 'ขวาหลัง (กลาง)', baseAreaCode: 'RB', gridX: 2, gridY: 1 },
  'RN-1': { label: 'Right Net', thaiLabel: 'ขวาหน้า (เน็ต)', baseAreaCode: 'RN', gridX: 2, gridY: 0 },

  // Right court detailed zones (missing in old config)
  'RN-2': { label: 'Right Net (Opp)', thaiLabel: 'ขวาหน้า (เน็ต - ตรงข้าม)', baseAreaCode: 'RN', gridX: 2, gridY: 0 },
  'RB-3': { label: 'Right Back (Mid Opp)', thaiLabel: 'ขวาหลัง (กลาง - ตรงข้าม)', baseAreaCode: 'RB', gridX: 2, gridY: 1 },
  'RB-4': { label: 'Right Back (Deep Opp)', thaiLabel: 'ขวาหลัง (ลึก - ตรงข้าม)', baseAreaCode: 'RB', gridX: 2, gridY: 2 },
  'CN-2': { label: 'Center Net (Opp)', thaiLabel: 'กลางหน้า (เน็ต - ตรงข้าม)', baseAreaCode: 'CN', gridX: 1, gridY: 0 },
  'CB-3': { label: 'Center Back (Mid Opp)', thaiLabel: 'กลางหลัง (กลาง - ตรงข้าม)', baseAreaCode: 'CB', gridX: 1, gridY: 1 },
  'CB-4': { label: 'Center Back (Deep Opp)', thaiLabel: 'กลางหลัง (ลึก - ตรงข้าม)', baseAreaCode: 'CB', gridX: 1, gridY: 2 },
  'LN-2': { label: 'Left Net (Opp)', thaiLabel: 'ซ้ายหน้า (เน็ต - ตรงข้าม)', baseAreaCode: 'LN', gridX: 0, gridY: 0 },
  'LB-3': { label: 'Left Back (Mid Opp)', thaiLabel: 'ซ้ายหลัง (กลาง - ตรงข้าม)', baseAreaCode: 'LB', gridX: 0, gridY: 1 },
  'LB-4': { label: 'Left Back (Deep Opp)', thaiLabel: 'ซ้ายหลัง (ลึก - ตรงข้าม)', baseAreaCode: 'LB', gridX: 0, gridY: 2 },

  // Football 4x4 detailed zones
  'F-0-0': { label: 'Attack Left', thaiLabel: 'รุกซ้าย', baseAreaCode: 'ATT_L', gridX: 0, gridY: 0 },
  'F-0-1': { label: 'Attack Center-Left', thaiLabel: 'รุกกลางซ้าย', baseAreaCode: 'ATT_C', gridX: 1, gridY: 0 },
  'F-0-2': { label: 'Attack Center-Right', thaiLabel: 'รุกกลางขวา', baseAreaCode: 'ATT_C', gridX: 2, gridY: 0 },
  'F-0-3': { label: 'Attack Right', thaiLabel: 'รุกขวา', baseAreaCode: 'ATT_R', gridX: 3, gridY: 0 },
  'F-1-0': { label: 'Upper Midfield Left', thaiLabel: 'กลางบนซ้าย', baseAreaCode: 'MID_L', gridX: 0, gridY: 1 },
  'F-1-1': { label: 'Upper Midfield Center-Left', thaiLabel: 'กลางบนซ้าย (ใน)', baseAreaCode: 'MID_C', gridX: 1, gridY: 1 },
  'F-1-2': { label: 'Upper Midfield Center-Right', thaiLabel: 'กลางบนขวา (ใน)', baseAreaCode: 'MID_C', gridX: 2, gridY: 1 },
  'F-1-3': { label: 'Upper Midfield Right', thaiLabel: 'กลางบนขวา', baseAreaCode: 'MID_R', gridX: 3, gridY: 1 },
  'F-2-0': { label: 'Lower Midfield Left', thaiLabel: 'กลางล่างซ้าย', baseAreaCode: 'MID_L', gridX: 0, gridY: 2 },
  'F-2-1': { label: 'Lower Midfield Center-Left', thaiLabel: 'กลางล่างซ้าย (ใน)', baseAreaCode: 'MID_C', gridX: 1, gridY: 2 },
  'F-2-2': { label: 'Lower Midfield Center-Right', thaiLabel: 'กลางล่างขวา (ใน)', baseAreaCode: 'MID_C', gridX: 2, gridY: 2 },
  'F-2-3': { label: 'Lower Midfield Right', thaiLabel: 'กลางล่างขวา', baseAreaCode: 'MID_R', gridX: 3, gridY: 2 },
  'F-3-0': { label: 'Defense Left', thaiLabel: 'รับซ้าย', baseAreaCode: 'DEF_L', gridX: 0, gridY: 3 },
  'F-3-1': { label: 'Defense Center-Left', thaiLabel: 'รับกลางซ้าย', baseAreaCode: 'DEF_C', gridX: 1, gridY: 3 },
  'F-3-2': { label: 'Defense Center-Right', thaiLabel: 'รับกลางขวา', baseAreaCode: 'DEF_C', gridX: 2, gridY: 3 },
  'F-3-3': { label: 'Defense Right', thaiLabel: 'รับขวา', baseAreaCode: 'DEF_R', gridX: 3, gridY: 3 },
};
