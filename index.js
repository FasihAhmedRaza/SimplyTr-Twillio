import 'dotenv/config'
import express from 'express';
import twilio from 'twilio';
import dialogflow from '@google-cloud/dialogflow';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_TOKEN;
const client = twilio(accountSid, authToken);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const port = process.env.PORT || 3000;

async function processDialogflowRequest(req) {
    try {
        console.log('Received request body:', JSON.stringify(req.body, null, 2));

        if (!req.body || !req.body.Body) {
            console.error('Invalid request body');
            return;
        }

        const sessionClient = new dialogflow.v2beta1.SessionsClient();
        
        const projectId = process.env.DIALOGFLOW_PROJECT_ID;
        const sessionId = `session-${Math.random().toString(36).substring(7)}`;
        const languageCode = 'en-US';

        const sessionPath = sessionClient.projectAgentSessionPath(
            projectId,
            sessionId
        );

        const request = {
            session: sessionPath,
            queryInput: {
                text: {
                    text: req.body.Body,
                    languageCode: languageCode,
                },
            },
        };

        // Detect intent
        const responses = await sessionClient.detectIntent(request);
        const messageToSend = responses[0].queryResult.fulfillmentText || 'Sorry, I couldn\'t understand that.';

        // Validate Twilio WhatsApp number before sending
        if (!process.env.TWILIO_WHATSAPP_NUMBER) {
            throw new Error('TWILIO_WHATSAPP_NUMBER is not defined');
        }

        console.log('Sending message:', {
            body: messageToSend,
            from: process.env.TWILIO_WHATSAPP_NUMBER,
            to: req.body.From
        });

        // Send WhatsApp response
        try {
            const message = await client.messages.create({
                body: messageToSend,
                from: process.env.TWILIO_WHATSAPP_NUMBER,
                to: req.body.From
            });

            console.log('Message sent successfully:', message.sid);
        } catch (twilioError) {
            console.error('Twilio Message Send Error:', {
                message: twilioError.message,
                code: twilioError.code,
                status: twilioError.status,
                moreInfo: twilioError.moreInfo || 'No additional info'
            });
            throw twilioError;
        }
    } catch (error) {
        console.error('Processing Error:', {
            message: error.message,
            stack: error.stack
        });
    }
}

app.post('/reply', async (req, res) => {
    console.log('Webhook received message:', req.body);
    
    await processDialogflowRequest(req);
    
    res.status(200).send('Message received');
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});