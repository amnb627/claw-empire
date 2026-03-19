/**
 * UTF-8検証用テスト文字列セット
 *
 * このファイルはモバイルInboxの文字化けテスト用です。
 * 全角・半角・絵文字・異体字を含む包括的な文字セットを提供します。
 *
 * @see https://github.com/anthropics/claw-empire/issues/xxx
 */

/**
 * 日本語文字カテゴリ別テストセット
 */
export const JapaneseCharsetTestSet = {
  /** 基本ひらがな - 46文字 */
  hiragana: "あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん",

  /** 基本カタカナ - 46文字 */
  katakana: "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン",

  /** 濁点・半濁点付きカタカナ */
  katakanaDakuten: "ガギグゲゴザジズゼゾダヂヅデドバビブベボパピプペポヴ",

  /** 半角カタカナ */
  katakanaHalfWidth: "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜｦﾝｧｨｩｪｫｬｭｮｯｰ｡｢｣",

  /** 全角英数字 */
  fullWidthAlphanumeric: "０１２３４５６７８９ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ",

  /** 全角記号 */
  fullWidthSymbols: "！＂＃＄％＆＇（）＊＋，－．／：；＜＝＞？＠［＼］＾＿｀｛｜｝～",

  /** 日本語用記号 */
  japanesePunctuation: "、。・：；？！゛゜´｀¨＾￣＿ヽヾゝゞ〃仝々〆〇ー―‐／＼～∥｜…‥‘’“”（）〔〕［］｛｝〈〉《》「」『』【】",

  /** 基本漢字（常用漢字の一部） */
  basicKanji: "日本語東京大阪京都北海道沖縄漢字試験文字化け対策本日晴れ",

  /** 難しい漢字（異体字・旧字体を含む） */
  complexKanji: "葛飾区亀有神社畷薫以此等嚢痴噛呂噺嘸嬶爺餅詹飴麺憋峠兎畠",

  /** 人名用漢字（難読） */
  personalNameKanji: "澁谷那須与一蓮薰渾神楓渥美鵠埼茨栃奈岡阜墟熊滋滋",

  /** 絵文字（基本） */
  emojiBasic: "😀😃😄😁😆😅🤣😂🙂🙃😉😊😇🥰😍🤩😘😗☺😚😙🥲😋😛😜🤪😝🤑🤗🤭🤫🤔🤐🤨😐😑😶😏😒🙄😬🤥😌😔😪🤤😴😷🤒🤕🤢🤮🤧🥵🥶🥴😵🤯",

  /** 絵文字（シンボル・国旗） */
  emojiSymbols: "🏳️🏴🏴‍☠️🏁🚩🏳️‍🌈🏳️‍⚧️🇯🇵🇺🇸🇬🇧🇨🇳🇰🇷🇩🇪🇫🇷",

  /** 絵文字（フラグタグ） - 注: 一部の環境で表示不可 */
  emojiFlags: "🇯🇵🇦🇨🇦🇩🇦🇪🇦🇫🇬🇦🇭🇮🇩🇮🇪🇮🇱🇮🇳🇮🇶🇮🇷🇯🇲🇯🇴🇰🇪🇰🇬🇰🇭🇰🇮🇰🇲🇰🇵🇰🇷🇰🇼🇰🇾🇱🇦🇱🇧",

  /** 絵文字（キーボード・テクニカル） */
  emojiTechnical: "⌨️💾💿📀📱📲☎️📞📟📠📺📻🎙️🎚️🎛️🧭⏰⏱️⏲️⌚⏳📡🔋🔌💡🔦🕯️🪔🧯🛢️💸💵💴💶💷",

  /** 絵文字（天気・自然） */
  emojiNature: "☀️🌤️⛅️🌥️☁️🌦️🌧️⛈️🌩️🌨️❄️☃️⛄️🌬️💨🌪️🌫️🌈☂️⚡️🔥💧🌊",

  /** 絵文字（動物・植物） */
  emojiAnimals: "🐶🐱🐭🐹🐰🦊🐻🐼🐨🐯🦁🐮🐷🐽🐸🐵🙈🙉🙊🐒🐔🐧🐦🐤🐣🐥🦆🦅🦉🦇🐺🐗🐴🦄🐝🐛🦋🐌🐞🐜🦟🦗🕷️🦂🐢🐍🦎🦖🦕🐙🦑🦐🦞🦀🐡🐠🐟🐬🐳🐋",

  /** 絵文字（食べ物） */
  emojiFood: "🍎🍏🍊🍋🍌🍉🍇🍓🍈🍒🍑🥭🍍🥥🥝🍅🍆🥑🥦🥬🥒🌶️🌽🥕🧄🧅🥔🍠🥐🥯🍞🥖🥨🧀🥚🍳🧈🥞🧇🥓🥩🍗🍖🌭🍔🍟🍕🥪🥙🧆🌮🌯🥗🥘🥫",

  /** 絵文字（スポーツ・アクティビティ） */
  emojiSports: "⚽️🏀🏈⚾️🥎🎾🏐🏉🥏🎱🪀🏓🏸🏒🏑🥍🏏🪃🥅⛳️🪁🏹🎣🤿🥊🥋🎽🛹🛼🛷⛸️🥌🎿⛷️🏂🪂🏋️‍♀️🏋️🏋️‍♂️🤼‍♀️🤼🤼‍♂️🤸‍♀️🤸🤸‍♂️⛹️‍♀️⛹️⛹️‍♂️🤺",

  /** 絵文字（旅行・場所） */
  emojiTravel: "🚗🚕🚙🚌🚎🏎️🚓🚑🚒🚐🛻🚚🚛🚜🦯🦽🦼🛴🚲🛵🏍️🛺🚨🚔🚍🚘🚖🚡🚠🚟🚃🚋🚞🚝🚄🚅🚈🚂🚆🚇🚊🚉✈️🛫🛬🛩️💺🛰️🚀🛸🚁🛶⛵️🚤🛥️🛳️⛴️🚢",

  /** 絵文字（楽器・芸術） */
  emojiArts: "🎹🥁🎷🎺🎸🪕🎻🎤🎧📻🎼🎹🥁🎷🎺🎸🪕🎻🎤🎧📻🎼🎵🎶",

  /** 絵文字（ハンドサイン） */
  emojiHands: "👋🤚🖐️✋🖖👌🤌🤏✌️🤞🤟🤘🤙👈👉👆🖕👇☝️👍👎✊👊🤛🤜👏🙌👐🤲🤝🙏",

  /** 絵文字（顔 - 感情） */
  emojiFacesEmotion: "😀😃😄😁😆😅🤣😂🙂🙃😉😊😇🥰😍🤩😘😗☺😚😙🥲😋😛😜🤪😝🤑🤗🤭🤫🤔🤐🤨😐😑😶😏😒🙄😬🤥😌😔😪🤤😴😷🤒🤕🤢🤮🤧🥵🥶🥴😵🤯",

  /** 絵文字（顔 - 身体） */
  emojiFacesBody: "👶🧒👦👧🧑👱👨🧔👩🧓👴👵🙍🙍‍♂️🙍‍♀️🙎🙎‍♂️🙎‍♀️🙅🙅‍♂️🙅‍♀️🙆🙆‍♂️🙆‍♀️💁💁‍♂️💁‍♀️🙋🙋‍♂️🙋‍♀️🧏🧏‍♂️🧏‍♀️🙇🙇‍♂️🙇‍♀️🤦🤦‍♂️🤦‍♀️🤷🤷‍♂️🤷‍♀️",

  /** サロゲートペア（4バイトUTF-8文字） */
  surrogatePairs: "𠮷𠮷𡈽𡌛𡔏𡕯𡗗𡘙𡚴𡛂𡜉𡝯𡣔𡧈𡧃𡫘𡵅𡵸𡵹𡵺𡶠𡶜𡶡𡶦𡶯𡶰𡶳𡶸𡴭𡴯𡴶𡻕𡻶𡻹𡼰𡼺𡽪𡽫𡾐𡾒𡾞𡾡𡾪",

  /** 異体字セレクタ（IVS - Ideographic Variation Sequence） */
  ivsCharacters: "葛󠄀葛󠄁葛󠄂󠄀󠄁󠄂﨔凞猪益礼神祥福靖精羽﨟蘒﨡諸﨣﨤逸都﨧﨨﨩",

  /** 組合せ文字（濁点・半濁点の合成） */
  combiningCharacters: "がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽ",

  /** 縦書き用文字 */
  verticalCharacters: "︰︱︲︳︴︵︶︷︸︹︺︻︼︽︾︿﹀﹁﹂﹃﹄﹅﹆﹇﹈﹉﹊﹋﹌﹍﹎﹏",

  /** 日本の電話番号形式 */
  phoneNumberFormats: [
    "03-1234-5678",  // 東京
    "06-1234-5678",  // 大阪
    "011-123-4567",  // 札幌
    "090-1234-5678", // 携帯
    "080-1234-5678", // 携帯
    "070-1234-5678", // PHS
  ],

  /** 日本の郵便番号形式 */
  postalCodeFormats: [
    "100-0001",  // 東京都千代田区
    "530-0001",  // 大阪府大阪市
    "060-0001",  // 北海道札幌市
  ],

  /** 日本の住所形式 */
  addressFormats: [
    "〒100-0001 東京都千代田区千代田1-1",
    "〒530-0001 大阪府大阪市北区梅田2-1-1",
    "〒060-0001 北海道札幌市中央区北1条西1-1",
  ],

  /** 日付形式 */
  dateFormatting: {
   和暦: {
      平成: "平成30年4月1日",
      令和: "令和5年3月8日",
      昭和: "昭和64年1月7日",
      大正: "大正15年12月25日",
      明治: "明治45年7月30日",
    },
    西暦: {
      ja: "2026年3月8日(日)",
      iso: "2026-03-08",
      slash: "2026/03/08",
    },
  },

  /** 価格表示形式 */
  priceFormats: {
    ja: "¥1,000",
    withTax: "¥1,100（税込）",
    taxIncluded: "¥1,000（税抜¥1,100）",
  },

  /** テキスト方向テスト（RTL混在） */
  mixedDirection: "日本語Englishالعربية한국어",

  /** 絵文字と日本語混在テキスト */
  emojiMixedText: [
    "本日は🌞晴天☀️です。気温は25℃🌡️です。",
    "🎉おめでとうございます！🎊",
    "🍜ラーメン🍜と🍜つけ麺🍜の違いは？",
    "🚃電車に乗って🚇駅に着きました。🚶‍♂️",
    "💻プログラミング🔧で🐛バグ🐜を修正✅しました。",
  ],

  /** 文字化け検出用パターン（Shift-JISで化けやすい文字） */
  shiftJisProblematic: [
    "−", // 全角マイナス
    "〜", // 全角チルダ
    "¢", // セント
    "£", // ポンド
    "¬", // 論理否定
    "‖", // 平行
    "—", // 全角ダッシュ
    "–", // 全角enダッシュ
  ],

  /** 機種依存文字 */
  deviceDependent: "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳㊑㊒㊓㊔㊕㊖㊗㊘㊙㊚㊛㊜㊝㊞㊟㊠㊡㊢㊣㊤㊥㊦㊧㊨㊩㊪㊫㊬㊭㊮㊯㊰㋐㋑㋒㋓㋔㋕㋖㋗㋘㋙㋚㋛㋜㋝㋞㋟㋠㋡㋢㋣㋤㋥㋦㋧㋨㋩㋪㋫㋬㋭㋮㋯㋰㋱㋲㋳㋴㋵㋶㋷㋸㋹㋺㋻㋼㋽㋾㍘㍙㍚㍛㍜㍝㍞㍟㍠㍡㍢㍣㍤㍥㍦㍧㍨㍩㍪㍫㍬㍭㍮㍯㍰㍗㎎㎏㎜㎝㎞㎡㎟㎠㎢㎣㎤㎥㎦㎕㎖㎗㎘㏄㏠㏡㏢㏣㏤㏥㏦㏧㏨㏩㏪㏫㏬㏭㏮㏯㏰㏱㏲㏳",

  /** 丸数字・囲み文字 */
  circledNumbers: "①②③④⑤⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳㉑㉒㉓㉔㉕㉖㉗㉘㉙㉚㉛㉜㉝㉞㉟㊱㊲㊳㊴㊵㊶㊷㊸㊹㊺㊻㊼㊽㊾㊿",

  /** 単位記号 */
  unitSymbols: "㎜㎝㎞㎡㎎㎏㏄㎀㎁㎂㎃㎄㎅㎆㎇㎈㎉㎊㎋㎌㎍㎎㎏㎰㎱㎲㎳㎴㎵㎶㎷㎸㎹㎺㎻㎼㎽㎾㎿㎐㎑㎒㎓㎔ℓ㍷㍸",
} as const;

/**
 * すべてのテスト文字列を連結したセット
 */
export const JapaneseCharsetAllInOne = Object.values(JapaneseCharsetTestSet).reduce(
  (acc, val) => {
    if (Array.isArray(val)) {
      return acc + val.join("");
    }
    if (typeof val === "object") {
      return acc + Object.values(val).flat().join("");
    }
    return acc + val;
  },
  ""
);

/**
 * UTF-8バイト長別テストセット
 */
export const Utf8ByteLengthTestSet = {
  /** 1バイト文字 (ASCII) */
  oneByte: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~",

  /** 2バイト文字（ラテン1補助、ギリシャ文字等） */
  twoByte: "ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿ",

  /** 3バイト文字（ひらがな、カタカナ、基本漢字、絵文字の大部分） */
  threeByte: JapaneseCharsetTestSet.hiragana + JapaneseCharsetTestSet.katakana + JapaneseCharsetTestSet.basicKanji,

  /** 4バイト文字（サロゲートペア、一部の絵文字） */
  fourByte: JapaneseCharsetTestSet.surrogatePairs + "🇯🇵🇺🇸🇬🇧",

  /** 組み合わせテスト（各バイト長を混在） */
  mixed: "ABC" + JapaneseCharsetTestSet.hiragana + "123" + JapaneseCharsetTestSet.katakana + "!@#" + JapaneseCharsetTestSet.basicKanji,
} as const;

/**
 * エンコーディング検証用インターフェース
 */
export interface EncodingTestResult {
  category: string;
  input: string;
  byteLength: number;
  utf8Encoded: string;
  decoded: string;
  passed: boolean;
}

/**
 * UTF-8エンコーディング検証関数
 * 文字列が正しくUTF-8でエンコード・デコードされるか検証します
 */
export function verifyUtf8Encoding(input: string, category: string): EncodingTestResult {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const utf8Bytes = encoder.encode(input);
  const decoded = decoder.decode(utf8Bytes);
  const passed = input === decoded;

  return {
    category,
    input,
    byteLength: utf8Bytes.length,
    utf8Encoded: Array.from(utf8Bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" "),
    decoded,
    passed,
  };
}

/**
 * すべての文字セットに対してUTF-8検証を実行
 */
export function runAllCharsetTests(): EncodingTestResult[] {
  const results: EncodingTestResult[] = [];

  for (const [category, value] of Object.entries(JapaneseCharsetTestSet)) {
    if (typeof value === "string") {
      results.push(verifyUtf8Encoding(value, category));
    }
  }

  return results;
}
