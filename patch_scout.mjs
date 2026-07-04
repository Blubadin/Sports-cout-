import fs from 'fs';

let content = fs.readFileSync('src/components/hud/ScoutHUDMode.tsx', 'utf8');

const regex = /<span className="text-white\/40">\{settings\.uiLanguage === 'th' \? 'พื้นที่ไฮไลต์:' : 'Highlighted:'\}<\/span>[\s\S]*?(?=<\/div>)/m;

const newFooter = `<span className="text-white/40">AREA:</span>
                <span className="text-amber-400 font-extrabold font-mono text-sm tracking-wider">
                  {(() => {
                    const payload = hoveredArea || null;
                    if (!payload || !payload.areaCode) return 'NONE';
                    const code = payload.areaCode;
                    const isThai = settings?.uiLanguage === 'th';
                    let label = "";
                    if (payload.outZone && OUT_ZONE_LABELS[payload.outZone]) {
                        label = isThai ? OUT_ZONE_LABELS[payload.outZone].thaiLabel : OUT_ZONE_LABELS[payload.outZone].label;
                    } else {
                        const foundArea = sportTemplate.areas.find(a => a.code === code);
                        const displayInfo = getAreaDisplay(code, isThai, foundArea?.thaiName || '');
                        label = displayInfo.sub ? \`\${displayInfo.main} (\${displayInfo.sub})\` : displayInfo.main;
                    }
                    return \`\${code} / \${label}\`;
                  })()}
                </span>
                {hoveredArea?.courtSide && hoveredArea.courtSide !== 'neutral' && (
                  <span className="text-white/60 text-[10px] uppercase font-bold">
                    ({hoveredArea.courtSide === 'teamA' ? teams[0]?.code : teams[1]?.code})
                  </span>
                )}`;

content = content.replace(regex, newFooter);
fs.writeFileSync('src/components/hud/ScoutHUDMode.tsx', content);
