// Exames laboratoriais comuns, com os nomes alternativos que aparecem nos laudos.
// Serve para reconhecer o exame no texto e juntar com o histórico (mesmo exame, nomes diferentes).
// [nome padrão, unidade usual, [apelidos]]
const LIST = [
  // Hemograma
  ['Hemácias', 'milhões/mm³', ['eritrocitos', 'eritrócitos', 'globulos vermelhos', 'glóbulos vermelhos', 'hemacias', 'contagem de hemacias', 'rbc']],
  ['Hemoglobina', 'g/dL', ['hb', 'hgb']],
  ['Hematócrito', '%', ['ht', 'hct', 'hematocrito']],
  ['VCM', 'fL', ['volume corpuscular medio', 'volume corpuscular médio', 'mcv']],
  ['HCM', 'pg', ['hemoglobina corpuscular media', 'hemoglobina corpuscular média', 'mch']],
  ['CHCM', 'g/dL', ['concentracao de hemoglobina corpuscular media', 'concentração de hemoglobina corpuscular média', 'mchc']],
  ['RDW', '%', ['rdw-cv', 'rdw cv', 'amplitude de distribuicao dos eritrocitos']],
  ['Leucócitos', '/mm³', ['leucocitos', 'leucograma', 'globulos brancos', 'glóbulos brancos', 'leucocitos totais', 'leucócitos totais', 'wbc']],
  ['Neutrófilos', '%', ['neutrofilos', 'neutrofilos segmentados', 'neutrófilos segmentados', 'segmentados', 'neutrofilos totais']],
  ['Bastonetes', '%', ['bastoes', 'bastões']],
  ['Linfócitos', '%', ['linfocitos', 'linfocitos tipicos', 'linfócitos típicos']],
  ['Monócitos', '%', ['monocitos']],
  ['Eosinófilos', '%', ['eosinofilos']],
  ['Basófilos', '%', ['basofilos']],
  ['Plaquetas', 'mil/mm³', ['contagem de plaquetas', 'plaquetometria', 'plt']],
  ['VPM', 'fL', ['volume plaquetario medio', 'volume plaquetário médio', 'mpv']],
  // Glicemia
  ['Glicose', 'mg/dL', ['glicemia', 'glicemia de jejum', 'glicose de jejum', 'glicose em jejum', 'glicose plasmatica', 'glicose plasmática']],
  ['Hemoglobina glicada', '%', ['hemoglobina glicada hba1c', 'hba1c', 'hb a1c', 'a1c', 'glico-hemoglobina', 'hemoglobina glicosilada']],
  ['Glicose média estimada', 'mg/dL', ['glicemia media estimada', 'glicemia média estimada']],
  ['Insulina', 'µUI/mL', ['insulina basal', 'insulina de jejum']],
  ['HOMA-IR', '', ['indice homa-ir', 'índice homa-ir', 'homa ir']],
  // Lipídios
  ['Colesterol total', 'mg/dL', ['colesterol']],
  ['HDL colesterol', 'mg/dL', ['hdl', 'colesterol hdl', 'hdl-colesterol', 'hdl-c']],
  ['LDL colesterol', 'mg/dL', ['ldl', 'colesterol ldl', 'ldl-colesterol', 'ldl-c']],
  ['VLDL colesterol', 'mg/dL', ['vldl', 'colesterol vldl', 'vldl-colesterol']],
  ['Colesterol não-HDL', 'mg/dL', ['colesterol nao hdl', 'colesterol não hdl', 'nao-hdl', 'não-hdl', 'nao hdl colesterol']],
  ['Triglicerídeos', 'mg/dL', ['triglicerides', 'triglicérides', 'triglicerideos', 'triacilglicerois']],
  // Rins
  ['Creatinina', 'mg/dL', ['creatinina serica', 'creatinina sérica']],
  ['Ureia', 'mg/dL', ['uréia', 'ureia serica', 'ureia sérica']],
  ['Taxa de filtração glomerular', 'mL/min/1,73m²', ['tfg', 'tfge', 'egfr', 'filtracao glomerular', 'filtração glomerular', 'taxa de filtracao glomerular estimada', 'clearance estimado', 'ritmo de filtracao glomerular']],
  ['Ácido úrico', 'mg/dL', ['acido urico', 'urato']],
  ['Microalbuminúria', 'mg/L', ['microalbuminuria', 'albumina urinaria', 'albumina urinária']],
  ['Relação albumina/creatinina', 'mg/g', ['relacao albumina/creatinina', 'relação albumina creatinina', 'rac']],
  // Eletrólitos
  ['Sódio', 'mEq/L', ['sodio', 'na']],
  ['Potássio', 'mEq/L', ['potassio', 'k']],
  ['Cálcio', 'mg/dL', ['calcio', 'calcio total', 'cálcio total']],
  ['Cálcio iônico', 'mmol/L', ['calcio ionico', 'calcio ionizado', 'cálcio ionizado']],
  ['Magnésio', 'mg/dL', ['magnesio']],
  ['Fósforo', 'mg/dL', ['fosforo', 'fosfato']],
  ['Cloro', 'mEq/L', ['cloreto']],
  // Fígado
  ['TGO (AST)', 'U/L', ['tgo', 'ast', 'aspartato aminotransferase', 'transaminase oxalacetica', 'transaminase glutamico oxalacetica', 'ast/tgo', 'tgo/ast']],
  ['TGP (ALT)', 'U/L', ['tgp', 'alt', 'alanina aminotransferase', 'transaminase piruvica', 'transaminase glutamico piruvica', 'alt/tgp', 'tgp/alt']],
  ['Gama-GT', 'U/L', ['gama gt', 'ggt', 'gama glutamil transferase', 'gama-glutamiltransferase', 'gamaglutamiltransferase']],
  ['Fosfatase alcalina', 'U/L', ['fa', 'falc']],
  ['Bilirrubina total', 'mg/dL', ['bilirrubinas totais', 'bilirrubina']],
  ['Bilirrubina direta', 'mg/dL', []],
  ['Bilirrubina indireta', 'mg/dL', []],
  ['Albumina', 'g/dL', ['albumina serica', 'albumina sérica']],
  ['Proteínas totais', 'g/dL', ['proteinas totais']],
  ['Globulinas', 'g/dL', ['globulina']],
  // Tireoide
  ['TSH', 'µUI/mL', ['hormonio tireoestimulante', 'hormônio tireoestimulante', 'tireotrofina', 'tsh ultrassensivel', 'tsh ultra-sensivel', 'tsh - hormonio tireoestimulante']],
  ['T4 livre', 'ng/dL', ['tiroxina livre', 't4l', 'ft4']],
  ['T3 total', 'ng/dL', ['triiodotironina', 't3']],
  ['T3 livre', 'pg/mL', ['triiodotironina livre', 't3l', 'ft3']],
  ['Anti-TPO', 'UI/mL', ['anticorpo antitireoperoxidase', 'anti tpo', 'antiperoxidase']],
  // Vitaminas e ferro
  ['Vitamina D', 'ng/mL', ['25-hidroxivitamina d', '25 hidroxivitamina d', '25(oh)d', '25-oh vitamina d', 'vitamina d 25 hidroxi', 'vitamina d - 25 hidroxi', 'vitamina d3', '25 oh vitamina d']],
  ['Vitamina B12', 'pg/mL', ['cianocobalamina', 'b12']],
  ['Ácido fólico', 'ng/mL', ['acido folico', 'folato']],
  ['Ferritina', 'ng/mL', []],
  ['Ferro sérico', 'µg/dL', ['ferro', 'ferro serico']],
  ['Transferrina', 'mg/dL', []],
  ['Saturação da transferrina', '%', ['saturacao da transferrina', 'indice de saturacao da transferrina', 'ist']],
  // Inflamação e coagulação
  ['Proteína C reativa', 'mg/L', ['pcr', 'proteina c reativa', 'pcr ultrassensivel', 'proteina c reativa ultrassensivel', 'pcr-us']],
  ['VHS', 'mm/h', ['velocidade de hemossedimentacao', 'velocidade de hemossedimentação', 'hemossedimentacao']],
  ['INR', '', ['rni', 'tap inr']],
  ['Tempo de protrombina', 's', ['tap', 'tp', 'tempo de protrombina (tap)']],
  ['TTPA', 's', ['tempo de tromboplastina parcial ativada', 'ttpa']],
  ['Fibrinogênio', 'mg/dL', ['fibrinogenio']],
  ['D-dímero', 'ng/mL', ['d-dimero', 'dimero d', 'dímero d']],
  // Músculo, pâncreas, coração
  ['CPK', 'U/L', ['creatinofosfoquinase', 'ck', 'creatinoquinase', 'ck total']],
  ['Amilase', 'U/L', []],
  ['Lipase', 'U/L', []],
  ['Troponina', 'ng/mL', ['troponina i', 'troponina t']],
  ['BNP', 'pg/mL', ['nt-probnp', 'peptideo natriuretico']],
  ['LDH', 'U/L', ['desidrogenase latica', 'desidrogenase lática', 'dhl']],
  // Hormônios
  ['PSA total', 'ng/mL', ['psa', 'antigeno prostatico especifico', 'antígeno prostático específico']],
  ['PSA livre', 'ng/mL', []],
  ['Cortisol', 'µg/dL', ['cortisol basal', 'cortisol matinal']],
  ['Testosterona total', 'ng/dL', ['testosterona']],
  ['Testosterona livre', 'pg/mL', []],
  ['Estradiol', 'pg/mL', []],
  ['Prolactina', 'ng/mL', []],
  ['FSH', 'mUI/mL', ['hormonio folículo estimulante', 'hormonio foliculo estimulante']],
  ['LH', 'mUI/mL', ['hormonio luteinizante']],
  ['Paratormônio', 'pg/mL', ['pth', 'paratormonio', 'pth intacto']],
  ['Homocisteína', 'µmol/L', ['homocisteina']],
];

const normalize = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9%/()+\-.,]+/g, ' ').replace(/\s+/g, ' ').trim();

const CATALOG = LIST.map(([name, unit, aliases]) => ({ name, unit, keys: [...new Set([name, ...aliases].map(normalize))] }));

// Mapa nome normalizado → item do catálogo
const BY_KEY = new Map();
for (const item of CATALOG) for (const k of item.keys) if (!BY_KEY.has(k)) BY_KEY.set(k, item);

module.exports = { CATALOG, BY_KEY, normalize };
