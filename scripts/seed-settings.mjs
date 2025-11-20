import mysql from 'mysql2/promise';

const defaultSettings = [
  {
    settingKey: 'MIN_PROFIT_THRESHOLD',
    settingValue: '8.00',
    description: 'Minimum profit to accept a book (EUR)'
  },
  {
    settingKey: 'ESTIMATED_FEES',
    settingValue: '4.50',
    description: 'Average shipping + commission estimate (EUR)'
  },
  {
    settingKey: 'PRICE_MODIFIERS',
    settingValue: JSON.stringify({
      COMO_NUEVO: 1.0,
      BUENO: 0.85,
      ACEPTABLE: 0.60
    }),
    description: 'Price multipliers by condition'
  },
  {
    settingKey: 'AMAZON_COMMISSION_PCT',
    settingValue: '15.00',
    description: 'Amazon commission percentage'
  },
  {
    settingKey: 'IBERLIBRO_COMMISSION_PCT',
    settingValue: '12.00',
    description: 'Iberlibro commission percentage'
  },
  {
    settingKey: 'AUTO_PRICE_PADDING',
    settingValue: '0.50',
    description: 'Extra margin added to suggested price (EUR)'
  }
];

async function seedSettings() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  try {
    console.log('Seeding system settings...');
    
    for (const setting of defaultSettings) {
      await conn.query(
        `INSERT INTO system_settings (settingKey, settingValue, description) 
         VALUES (?, ?, ?) 
         ON DUPLICATE KEY UPDATE settingValue = VALUES(settingValue), description = VALUES(description)`,
        [setting.settingKey, setting.settingValue, setting.description]
      );
      console.log(`✓ ${setting.settingKey}`);
    }
    
    console.log('\n✅ System settings seeded successfully!');
  } catch (error) {
    console.error('Error seeding settings:', error);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

seedSettings();
