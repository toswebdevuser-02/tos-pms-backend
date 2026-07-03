/**
 * Bulk-create members + temp login credentials from a name/email list.
 * Usage: npx tsx src/seed-members.ts
 *
 * Default temp password: TOS@teslacadd
 * All created users get mustReset=true so they must change on first login.
 * Skips members whose email already has a user account.
 */
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'

const TEMP_PASSWORD = 'TOS@teslacadd'

const MEMBERS: { name: string; email: string }[] = [
  { name: 'Hardik Agarwal', email: 'hardik@teslacadd.com' },
  { name: 'Celestina David', email: 'celestina@teslacadd.com' },
  { name: 'Vishakh Badrinath Dalwadi', email: 'vishakh@teslacadd.com' },
  { name: 'Reena Dewangan', email: 'reena@teslacadd.com' },
  { name: 'Rajdeep Singh', email: 'rajdeep@teslacadd.com' },
  { name: 'Anushree Ajay Mandwekar', email: 'anushree@teslacadd.com' },
  { name: 'Hina Matang', email: 'hina@teslacadd.com' },
  { name: 'Bhavya Choksi', email: 'bhavya@teslacadd.com' },
  { name: 'Anjali Kalani', email: 'anjali@teslacadd.com' },
  { name: 'Narsinga Ram', email: 'narsinga@teslacadd.com' },
  { name: 'Pratyush Saxena', email: 'pratyush@teslacadd.com' },
  { name: 'Shruti Sethiya', email: 'shruti.s@teslacadd.com' },
  { name: 'Muskaan Gandhi', email: 'muskaan@teslacadd.com' },
  { name: 'Pranjali Ravishwar Shirsat', email: 'pranjali@teslacadd.com' },
  { name: 'Khushi Yash Shah', email: 'khushib@teslacadd.com' },
  { name: 'Priyanka Nangare', email: 'priyanka@teslacadd.com' },
  { name: 'Hazel Dhari', email: 'hazel@teslacadd.com' },
  { name: 'Vaidehi Mandhaniya', email: 'vaidehi@teslacadd.com' },
  { name: 'Sonu G Nai', email: 'sonu@teslacadd.com' },
  { name: 'Dibesh Bharti', email: 'dibesh@teslacadd.com' },
  { name: 'Aakib Shaikh', email: 'aakib@teslacadd.com' },
  { name: 'Vijay Raghavan', email: 'vijay@teslacadd.com' },
  { name: 'Mayur Subhash Rathod', email: 'mayur@teslacadd.com' },
  { name: 'Hemangi Alpeshkumar Suthar', email: 'hemangi@teslacadd.com' },
  { name: 'Om Ingole', email: 'om@teslacadd.com' },
  { name: 'Divyashri Chandrashekar Vaidya', email: 'divyashri@teslacadd.com' },
  { name: 'Anshul Jariyal', email: 'anshul@teslacadd.com' },
  { name: 'Ankit Kumar Suthar', email: 'ankit.suthar@teslacadd.com' },
  { name: 'Krisha Bhatt', email: 'krisha.bhatt@teslacadd.com' },
  { name: 'Deepali Ghosh', email: 'deepali.ghosh@teslacadd.com' },
  { name: 'Vishva KG', email: 'vishwa.kg@teslacadd.com' },
  { name: 'Joel Jose', email: 'joel.jose@teslacadd.com' },
  { name: 'Rahul Gunawat', email: 'rahul.gunavat@teslacadd.com' },
  { name: 'Shalini Soni', email: 'shalini.soni@teslacadd.com' },
  { name: 'Anjali Savekar', email: 'anjali.savekar@teslacadd.com' },
  { name: 'Dhruvi Dixit bhai Sheth', email: 'dhruvi.seth@teslacadd.com' },
  { name: 'Hiranmayi Joshi', email: 'hiranmayi.joshi@teslacadd.com' },
  { name: 'Meet Vaidya', email: 'meet.vaidya@teslacadd.com' },
  { name: 'Devansh Narendra Bhudiya', email: 'devansh.bhudiya@teslacadd.com' },
  { name: 'Krina Chauhan', email: 'krina.chauhan@teslacadd.com' },
  { name: 'Shubham Parmar', email: 'shubham.parmar@teslacadd.com' },
  { name: 'Mehul Kale', email: 'mehul.kale@teslacadd.com' },
  { name: 'Khushi Maske', email: 'khushi.maske@teslacadd.com' },
  { name: 'Amit Kumar', email: 'amit.kumar@teslacadd.com' },
  { name: 'Deven Tank', email: 'deven.tank@teslacadd.com' },
  { name: 'Saksham Choudhary', email: 'saksham.choudhary@teslacadd.com' },
  { name: 'Neha Kumari', email: 'neha.kumari@teslacadd.com' },
  { name: 'Vikram Prakash Sharma', email: 'vikram.sharma@teslacadd.com' },
  { name: 'Raj Singh Chauhan', email: 'raj.chauhan@teslacadd.com' },
  { name: 'Aarti Tiwari', email: 'aarti.tiwari@teslacadd.com' },
  { name: 'Nishant Detwal', email: 'nishant.detwal@teslacadd.com' },
  { name: 'Someshwar Taksalkar', email: 'someshwar.taksalkar@teslacadd.com' },
  { name: 'Gulshan Borade', email: 'gulshan.borade@teslacadd.com' },
  { name: 'Tejas Raut', email: 'tejas.raut@teslacadd.com' },
  { name: 'Shivang Jayendrabhai Raval', email: 'shivang.raval@teslacadd.com' },
  { name: 'Barsha Rout', email: 'barsha.rout@teslacadd.com' },
  { name: 'Sanskruti Jitendra Modi', email: 'sanskruti.modi@teslacadd.com' },
  { name: 'Zeel Shah', email: 'zeel.shah@teslacadd.com' },
  { name: 'Geetika Choudaha', email: 'geetika.choudaha@teslacadd.com' },
  { name: 'Rudresh Gupta', email: 'rudresh.gupta@teslacadd.com' },
  { name: 'Shravani Raikar', email: 'shravani.raikar@teslacadd.com' },
  { name: 'Sakshi Ashwin Supe', email: 'sakshi.supe@teslacadd.com' },
  { name: 'Shivani Pate', email: 'shivani.pate@teslacadd.com' },
  { name: 'Anandha Narayan Nair', email: 'anandha.nair@teslacadd.com' },
  { name: 'Smit Mistry', email: 'smit.mistry@teslacadd.com' },
  { name: 'Janhavi Patil', email: 'janhavi.patil@teslacadd.com' },
  { name: 'Keshav Sanjay Chanchlani', email: 'keshav.chanchlani@teslacadd.com' },
  { name: 'Aditi Shukla', email: 'aditi.shukla@teslacadd.com' },
  { name: 'Rashi Khode', email: 'rashi.khode@teslacadd.com' },
  { name: 'Adhar Tyagi', email: 'adhar.tyagi@teslacadd.com' },
  { name: 'Anupriya Singh', email: 'anupriya.singh@teslacadd.com' },
  { name: 'Sejal Nagar', email: 'sejal.nagar@teslacadd.com' },
  { name: 'Neshat Fatima', email: 'neshat.fatima@teslacadd.com' },
  { name: 'Mrunmayee Motegaonkar', email: 'mrunmayee.motegaonkar@teslacadd.com' },
  { name: 'Aishwarya Rajesh', email: 'aishwarya.rajesh@teslacadd.com' },
  { name: 'Abhijit Uttam Shegokar', email: 'abhijit.shegokar@teslacadd.com' },
  { name: 'Mrunali Khandade', email: 'mrunali.khandade@teslacadd.com' },
  { name: 'Kunj Padiya', email: 'kunj.padiya@teslacadd.com' },
  { name: 'Sandalee Mathur', email: 'sandalee.mathur@teslacadd.com' },
  { name: 'Akshita Sood', email: 'akshita.sood@teslacadd.com' },
  { name: 'Badal Harshadkumar Shah', email: 'badal.shah@teslacadd.com' },
  { name: 'Nehal Rana', email: 'nehal.rana@teslacadd.com' },
]

async function main(): Promise<void> {
  const hash = await bcrypt.hash(TEMP_PASSWORD, 10)
  let created = 0, skipped = 0

  for (const { name, email } of MEMBERS) {
    const lower = email.trim().toLowerCase()

    // Upsert member record
    let member = await prisma.member.findFirst({ where: { email: lower } })
    if (!member) {
      member = await prisma.member.create({ data: { name, email: lower, role: 'Employee' } })
    }

    // Create user only if one doesn't exist yet (check both email and memberId)
    const existingByEmail = await prisma.user.findUnique({ where: { email: lower } })
    const existingByMember = await prisma.user.findUnique({ where: { memberId: member.id } })
    if (existingByEmail || existingByMember) {
      console.log(`SKIP  ${lower} (already has login)`)
      skipped++
      continue
    }

    await prisma.user.create({
      data: { email: lower, passwordHash: hash, role: 'Employee', memberId: member.id, mustReset: true }
    })
    console.log(`OK    ${name} <${lower}>`)
    created++
  }

  console.log(`\nDone. Created: ${created}, Skipped: ${skipped}`)
  console.log(`Temp password: ${TEMP_PASSWORD}`)
  console.log('All users must change password on first login.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
