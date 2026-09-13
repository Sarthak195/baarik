/**
 * An abridged synthetic offer letter, condensed from `fixtures/offer-letter-meridian.txt`.
 *
 * Every clause sits on a single line. That is not formatting laziness: the grounding
 * helper finds a quote by substring search, and a quote that straddles a hard wrap in
 * the source would have to carry the newline in exactly the right place to match. One
 * line per clause removes a whole class of silent fixture rot.
 *
 * The document is fictional. Meridian Systems does not exist, the parties do not
 * exist, and no wording here is copied from any real employer's letter.
 */
export const OFFER_LETTER_TEXT = `MERIDIAN SYSTEMS PRIVATE LIMITED
Ref: MSPL/HR/OFF/2026/0417 · Date: 2 February 2026
To: Ms. Ananya Rao Kulkarni, Bengaluru — 560041
Subject: Letter of Appointment — Software Engineer II

3. REMUNERATION

3.1 Your annual cost to company shall be Rupees Twelve Lakh (Rs. 12,00,000) per annum (Rs. 1,00,000 per month), payable monthly in arrears, subject to deduction of tax at source.

3.3 You may be granted employee stock options under the Meridian Systems Employee Stock Option Plan, 2021, subject to the terms of that Plan and to such grant letters as may be issued to you from time to time.

5. RESIGNATION, NOTICE AND GARDEN LEAVE

5.1 If you wish to resign from the services of the Company, you shall give the Company prior written notice of ninety (90) days.

5.2 If the Company wishes to bring your employment to an end, it shall give you prior written notice of thirty (30) days.

5.3 The Company may at its discretion require you, during the whole or any part of your notice period, to remain away from the Company's premises, systems and colleagues ("garden leave"). No salary, allowance or benefit shall be payable to you in respect of any period of garden leave.

6. TRAINING AND SERVICE BOND

6.2 In consideration of that training, you agree to remain in the continuous service of the Company for a period of twenty-four (24) months from your date of joining.

6.3 If you resign, or if your employment ends for any reason attributable to you, before the expiry of the said twenty-four (24) months, you shall pay the Company Rupees Two Lakh (Rs. 2,00,000) as agreed and liquidated damages and not as a penalty. The said sum shall be payable in full irrespective of the service actually completed.

7. POST-EMPLOYMENT NON-COMPETITION

7.1 For a period of twenty-four (24) months after the cessation of your employment, for any reason whatsoever, you shall not directly or indirectly join, be employed by, advise, consult for, or hold any interest in any competing business in the territory of India.

10. INTELLECTUAL PROPERTY

10.1 All inventions, discoveries, designs, source code and other intellectual property conceived or created by you at any time during your employment — whether or not during working hours, whether or not using the Company's equipment, and whether or not related to the business of the Company — shall vest absolutely in the Company.

11. DISPUTE RESOLUTION AND LIMITATION

11.1 Any dispute arising out of or in connection with your employment shall be referred to arbitration under the Arbitration and Conciliation Act, 1996, before a sole arbitrator appointed by the Managing Director of the Company. The seat of arbitration shall be Bengaluru.

11.3 No claim, demand or proceeding arising out of or relating to your employment shall be entertained, and every right in respect of such claim shall stand extinguished, unless the claim is raised in writing within six (6) months of the date on which the cause of action first arose.

12. GENERAL

12.2 This letter shall be governed by and construed in accordance with the laws of India.
`;
