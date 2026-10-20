// Synthetic exports laid out like the files custodians' "download positions"
// buttons produce: title lines above the header, total and pending rows,
// footer disclaimers, a second section after the positions, one file holding
// several accounts, and European number formats. Values are invented.

export const SCHWAB_STYLE = `"Positions for account Individual ...123 as of 10:02 AM ET, 2026/10/19"

"Symbol","Description","Quantity","Price","Price Change %","Price Change $","Market Value","Day Change %","Day Change $","Cost Basis","Gain/Loss %","Gain/Loss $","Ratings","Reinvest Dividends?","Capital Gains?","% Of Account","Security Type"
"AAPL","APPLE INC","100","$228.50","0.5%","$1.10","$22,850.00","0.5%","$110.00","$15,000.00","52.33%","$7,850.00","B","No","N/A","45.2%","Equity"
"VTI","VANGUARD TOTAL STOCK MARKET ETF","50","$290.10","0.2%","$0.60","$14,505.00","0.2%","$30.00","$12,000.00","20.88%","$2,505.00","--","Yes","N/A","28.7%","ETFs & Closed End Funds"
"Cash & Cash Investments","--","--","--","--","--","$13,200.00","0%","$0.00","--","--","--","--","--","--","26.1%","Cash and Money Market"
"Account Total","--","--","--","--","--","$50,555.00","0.3%","$140.00","$27,000.00","--","$10,355.00","--","--","--","100%","--"
`;

export const FIDELITY_STYLE = `﻿Account Number,Account Name,Symbol,Description,Quantity,Last Price,Last Price Change,Current Value,Today's Gain/Loss Dollar,Today's Gain/Loss Percent,Total Gain/Loss Dollar,Total Gain/Loss Percent,Percent Of Account,Cost Basis Total,Average Cost Basis,Type
Z12345678,Individual,SPAXX**,HELD IN MONEY MARKET,,,,$5432.10,,,,,10.5%,,,Cash,
Z12345678,Individual,MSFT,MICROSOFT CORP,40,$410.25,+$2.10,$16410.00,+$84.00,+0.51%,+$4410.00,+36.75%,31.7%,$12000.00,$300.00,Margin,
Z12345678,Individual,Pending Activity,,,,,-$250.00,,,,,,,,,
X98765432,ROTH IRA,FXAIX,FIDELITY 500 INDEX FUND,120.553,$195.40,+$0.80,$23556.05,+$96.44,+0.41%,+$5556.05,+30.87%,100%,$18000.00,$149.31,Cash,

"The data and information in this spreadsheet is provided to you solely for your use and is not for distribution."
"Brokerage services are provided by an example broker-dealer."
"Date downloaded 10/19/2026 4:00 PM ET"
`;

export const VANGUARD_STYLE = `Account Number,Investment Name,Symbol,Shares,Share Price,Total Value,
12345678,VANGUARD FEDERAL MONEY MARKET,VMFXX,1500.25,1,1500.25,
12345678,VANGUARD TOTAL BOND MARKET ETF,BND,200,72.5,14500,

Account Number,Trade Date,Settlement Date,Transaction Type,Transaction Description,Investment Name,Symbol,Shares,Share Price,Principal Amount,Commissions and Fees,Net Amount,Accrued Interest,Account Type,
12345678,2026-10-01,2026-10-02,Buy,Buy,VANGUARD TOTAL BOND MARKET ETF,BND,10,72.1,-721,0,-721,0,CASH,
`;

export const SWISS_SEMICOLON = `Name;ISIN;Anzahl;Kurs;Wert;Währung
Nestlé SA;CH0038863350;100;"95,50";"9.550,00";CHF
Roche Holding;CH0012032048;20;"260,10";"5.202,00";CHF
`;
