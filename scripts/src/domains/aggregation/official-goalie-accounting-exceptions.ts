// Exact source exceptions, not a general arithmetic exemption. Official summary,
// fresh gamecenter boxscore and HTML reports preserve each native discrepancy.
// These are not demonstrated shootout/penalty-shot corrections; do not invent saves.
// TOI binds the reviewed stored minute precision; official seconds remain provenance.
export const OFFICIAL_GOALIE_ACCOUNTING_REVIEW_SHA256 =
  "9dd76901430c96c0c8c79e17a40e59660c493bbcfe245efd187f139893672b9a";
export const OFFICIAL_GOALIE_ACCOUNTING_EXCEPTIONS = [
  {
    name: "Alexandar Georgiev",
    nhlPlayerId: 8480382,
    date: "2023-01-10",
    team: "COL",
    opponent: "FLA",
    gameId: 2022020656,
    tuple: {
      GP: 1,
      W: 0,
      GA: 5,
      SV: 33,
      SA: 37,
      TOI: 58.67,
    },
    officialTOISeconds: 3520,
    sources: [
      {
        url: "https://api.nhle.com/stats/rest/en/goalie/summary?isAggregate=false&isGame=true&start=0&limit=-1&cayenneExp=gameId%3E%3D2022020601+and+gameId%3C%3D2022020700",
        sha256:
          "df7a0f91eb10002dd5b46496918140ce567bae0e8e11edf5c9c1c1c7096d0d1d",
      },
      {
        url: "https://api-web.nhle.com/v1/gamecenter/2022020656/boxscore",
        sha256:
          "a40e72d7f0a3d6ffd8ceab7348c2d05d2ee8ce7c95f207ff84a93ad4ad43f9a1",
      },
      {
        url: "https://www.nhl.com/scores/htmlreports/20222023/GS020656.HTM",
        sha256:
          "e8a78cf52b8e04df7aa72539eb7e4358e1cd51ac9f490e2cf615a5797f3b8738",
      },
    ],
  },
  {
    name: "Martin Jones",
    nhlPlayerId: 8474889,
    date: "2023-01-17",
    team: "SEA",
    opponent: "EDM",
    gameId: 2022020711,
    tuple: {
      GP: 1,
      W: 0,
      GA: 5,
      SV: 29,
      SA: 33,
      TOI: 60.0,
    },
    officialTOISeconds: 3600,
    sources: [
      {
        url: "https://api.nhle.com/stats/rest/en/goalie/summary?isAggregate=false&isGame=true&start=0&limit=-1&cayenneExp=gameId%3E%3D2022020701+and+gameId%3C%3D2022020800",
        sha256:
          "bc15b98822451bea02efa5cd6ce2e7faf6c0468b62d7b35aa9f665981a39b4d9",
      },
      {
        url: "https://api-web.nhle.com/v1/gamecenter/2022020711/boxscore",
        sha256:
          "8639bdb246f7abb8b23b12ac69923d162ebc64d7c39695186e95a80660b871a6",
      },
      {
        url: "https://www.nhl.com/scores/htmlreports/20222023/GS020711.HTM",
        sha256:
          "014b403e359e69fca233bc18fa46764701c0eaeb5aab41b64afac84aa0285717",
      },
    ],
  },
  {
    name: "Ilya Sorokin",
    nhlPlayerId: 8478009,
    date: "2023-02-24",
    team: "NYI",
    opponent: "LAK",
    gameId: 2022020934,
    tuple: {
      GP: 1,
      W: 0,
      GA: 3,
      SV: 26,
      SA: 28,
      TOI: 58.63,
    },
    officialTOISeconds: 3518,
    sources: [
      {
        url: "https://api.nhle.com/stats/rest/en/goalie/summary?isAggregate=false&isGame=true&start=0&limit=-1&cayenneExp=gameId%3E%3D2022020901+and+gameId%3C%3D2022021000",
        sha256:
          "ccb40a55c826939a2640585a8d8b44d32e53cfb0f270aaf4df6c04793fa54115",
      },
      {
        url: "https://api-web.nhle.com/v1/gamecenter/2022020934/boxscore",
        sha256:
          "28f3669d1e9f7e38b516609bc94f3798a727565df4ec5867d1c57004fe3f8293",
      },
      {
        url: "https://www.nhl.com/scores/htmlreports/20222023/GS020934.HTM",
        sha256:
          "e82b312a13312c43a4c4ef894b3ae0fa25d833be0bb344944a98263b4a8f8357",
      },
    ],
  },
  {
    name: "Darcy Kuemper",
    nhlPlayerId: 8475311,
    date: "2023-03-11",
    team: "WSH",
    opponent: "NYI",
    gameId: 2022021048,
    tuple: {
      GP: 1,
      W: 1,
      GA: 1,
      SV: 18,
      SA: 18,
      TOI: 59.32,
    },
    officialTOISeconds: 3559,
    sources: [
      {
        url: "https://api.nhle.com/stats/rest/en/goalie/summary?isAggregate=false&isGame=true&start=0&limit=-1&cayenneExp=gameId%3E%3D2022021001+and+gameId%3C%3D2022021100",
        sha256:
          "59115b6c58047ab8761e34515bbd95ce8d7d14188198addd065e62e1e893d1b9",
      },
      {
        url: "https://api-web.nhle.com/v1/gamecenter/2022021048/boxscore",
        sha256:
          "5d09e5bd2a847aa052147e730c29263441934bf47d4598df674c27a65a5b0d19",
      },
      {
        url: "https://www.nhl.com/scores/htmlreports/20222023/GS021048.HTM",
        sha256:
          "927799fa2603515f3465c1008b24d671a8bee08f4d1c421b61ae1dcefeb1d446",
      },
    ],
  },
  {
    name: "Stuart Skinner",
    nhlPlayerId: 8479973,
    date: "2023-04-11",
    team: "EDM",
    opponent: "COL",
    gameId: 2022021292,
    tuple: {
      GP: 1,
      W: 1,
      GA: 1,
      SV: 29,
      SA: 29,
      TOI: 61.83,
    },
    officialTOISeconds: 3710,
    sources: [
      {
        url: "https://api.nhle.com/stats/rest/en/goalie/summary?isAggregate=false&isGame=true&start=0&limit=-1&cayenneExp=gameId%3E%3D2022021201+and+gameId%3C%3D2022021300",
        sha256:
          "df896b45fe0a87aa937b0af6d7e50dd80f7c99f40aeeb9b67d4d700bb57f248d",
      },
      {
        url: "https://api-web.nhle.com/v1/gamecenter/2022021292/boxscore",
        sha256:
          "ecce5135de606f4542de824d14091ca6fe108dd9cef96d0dd8e3bbd0751263f8",
      },
      {
        url: "https://www.nhl.com/scores/htmlreports/20222023/GS021292.HTM",
        sha256:
          "eb8631eb1d0d918aa548b1d131612490623263d2119537cce12fd465ad8dfd2b",
      },
    ],
  },
  {
    name: "Linus Ullmark",
    nhlPlayerId: 8476999,
    date: "2023-12-23",
    team: "BOS",
    opponent: "MIN",
    gameId: 2023020518,
    tuple: {
      GP: 1,
      W: 0,
      GA: 3,
      SV: 33,
      SA: 35,
      TOI: 58.27,
    },
    officialTOISeconds: 3496,
    sources: [
      {
        url: "https://api.nhle.com/stats/rest/en/goalie/summary?isAggregate=false&isGame=true&start=0&limit=-1&cayenneExp=gameId%3E%3D2023020501+and+gameId%3C%3D2023020600",
        sha256:
          "684188229a35a00f765c91076de991c4be7dc3b2f5bbb6244bf90566e45193ab",
      },
      {
        url: "https://api-web.nhle.com/v1/gamecenter/2023020518/boxscore",
        sha256:
          "2c4b40e85568a3d7bf5d35b056770802086d9bdca8f4dbdc20737b270da9ccbd",
      },
      {
        url: "https://www.nhl.com/scores/htmlreports/20232024/GS020518.HTM",
        sha256:
          "a1049f4347c7a48a3da0e1ba074786e68a358a2dbff3e6abe7e5ebd8d4de2b7f",
      },
    ],
  },
  {
    name: "Cam Talbot",
    nhlPlayerId: 8475660,
    date: "2024-03-23",
    team: "LAK",
    opponent: "TBL",
    gameId: 2023021121,
    tuple: {
      GP: 1,
      W: 1,
      GA: 3,
      SV: 22,
      SA: 24,
      TOI: 59.65,
    },
    officialTOISeconds: 3579,
    sources: [
      {
        url: "https://api.nhle.com/stats/rest/en/goalie/summary?isAggregate=false&isGame=true&start=0&limit=-1&cayenneExp=gameId%3E%3D2023021101+and+gameId%3C%3D2023021200",
        sha256:
          "186a5cc4776185015b5e5b02e4a20a2b016802d03b8b8eb4d4c0f5da08df951e",
      },
      {
        url: "https://api-web.nhle.com/v1/gamecenter/2023021121/boxscore",
        sha256:
          "74083093d74b81caa20b349fbf1b662dc1b1e9ee91ec5ee8261e9c7e2492f7fb",
      },
      {
        url: "https://www.nhl.com/scores/htmlreports/20232024/GS021121.HTM",
        sha256:
          "091fc7dc15ec1ca431327a60c521525379520539d2fc24ccb94d60784fa0f6fd",
      },
    ],
  },
] as const;
