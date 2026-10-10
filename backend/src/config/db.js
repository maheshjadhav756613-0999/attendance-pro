import mongoose from 'mongoose';

const DEFAULT_MONGO_URI = 'mongodb://127.0.0.1:27017/attendancepro';

const connectDB = async () => {
  const mongoUri = process.env.MONGODB_URI || DEFAULT_MONGO_URI;

  try {
    await mongoose.connect(mongoUri);
    console.log('✅ MongoDB Connected');
  } catch (error) {
    console.error('❌ MongoDB Error:', error.message);
    process.exit(1);
  }
};

export default connectDB;